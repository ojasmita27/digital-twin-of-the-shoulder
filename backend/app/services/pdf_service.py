"""
PDF Report Generation Service for ShoulderTwin.
Uses ReportLab when available, with a valid pure-Python PDF 1.4 fallback.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any, Dict, List


def _build_report_lines(case_data: Dict[str, Any], user_role: str) -> List[str]:
    lines: List[str] = []
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines.append("SHOULDERTWIN - PATIENT-SPECIFIC DIGITAL TWIN ENGINEERING REPORT")
    lines.append(f"Generated: {now_str}")
    lines.append(f"Case ID: {case_data.get('id', 'N/A')} | Name: {case_data.get('name', 'N/A')}")
    lines.append("=" * 78)

    # 3. Patient information only where authorized
    demographics = case_data.get("demographics") or {}
    if user_role in ("doctor", "admin"):
        lines.append("1. PATIENT & CASE SUMMARY (AUTHORIZED CLINICAL VIEW)")
        lines.append(f"   Subject ID: {demographics.get('researchSubjectId', 'Not recorded')}")
        lines.append(f"   Affected Side: {demographics.get('affectedSide', 'Not recorded')}")
        lines.append(f"   Indication: {demographics.get('indication', 'Not recorded')}")
    else:
        lines.append("1. CASE SUMMARY (DE-IDENTIFIED RESEARCH VIEW)")
        lines.append(f"   Affected Side: {demographics.get('affectedSide', 'Not recorded')}")
        lines.append("   Patient identifiers redacted per role policy.")

    # 4. Imaging & CT processing summary
    imaging = case_data.get("imaging") or {}
    lines.append("")
    lines.append("2. IMAGING & CT PROCESSING SUMMARY")
    if imaging:
        lines.append(
            f"   Slices: {imaging.get('sliceCount', 'N/A')} | "
            f"Dimensions: {imaging.get('rows', '?')}x{imaging.get('columns', '?')} | "
            f"Slice Thickness: {imaging.get('sliceThicknessMm', 'N/A')} mm"
        )
    else:
        lines.append("   No CT imaging imported.")

    # 5. Segmentation status
    seg = case_data.get("segmentationJob") or {}
    lines.append("")
    lines.append("3. SEGMENTATION STATUS")
    if seg:
        lines.append(
            f"   Version: v{seg.get('version', 1)} | Method: {seg.get('separationMethod', seg.get('method', 'N/A'))} | "
            f"Status: {seg.get('separationStatus', seg.get('status', 'N/A'))}"
        )
        lines.append(
            f"   Scapula Voxels: {seg.get('scapulaVoxelCount', 'N/A')} ({seg.get('scapulaVolumeMm3', 'N/A')} mm3) | "
            f"Humerus Voxels: {seg.get('humerusVoxelCount', 'N/A')} ({seg.get('humerusVolumeMm3', 'N/A')} mm3)"
        )
    else:
        lines.append("   Segmentation not yet completed.")

    # 7. Bone quality statistics
    bq = case_data.get("boneQualityMetrics") or {}
    lines.append("")
    lines.append("4. BONE QUALITY (CT ATTENUATION) STATISTICS")
    if bq:
        lines.append(f"   Calibration: {'Calibrated HU' if bq.get('calibrated') else 'Uncalibrated Intensity'}")
        for struct_key in ("scapula", "humerus"):
            st = bq.get(struct_key)
            if st:
                lines.append(
                    f"   {struct_key.capitalize()}: Mean={st.get('meanHu')} HU, "
                    f"Min={st.get('minHu')} HU, Max={st.get('maxHu')} HU, SD={st.get('stdHu')} HU"
                )
        lines.append("   Note: CT attenuation is NOT equivalent to validated BMD.")
    else:
        lines.append("   Bone quality analysis not yet run.")

    # 8. Anatomical landmarks
    landmarks = case_data.get("landmarks") or []
    lines.append("")
    lines.append(f"5. ANATOMICAL LANDMARKS ({len(landmarks)})")
    if landmarks:
        for lm in landmarks[:16]:
            coords = lm.get("coordinatesMm", [])
            lines.append(
                f"   - {lm.get('name', 'Unnamed')} [{lm.get('source', 'manual')}]: "
                f"{coords} mm"
            )
    else:
        lines.append("   No anatomical landmarks recorded.")

    # 6 & 10. Measurements & Planning measurements
    measurements = case_data.get("measurements") or []
    lines.append("")
    lines.append(f"6. SPATIAL & PLANNING MEASUREMENTS ({len(measurements)})")
    if measurements:
        for m in measurements[:16]:
            lines.append(
                f"   - {m.get('name', m.get('type', 'Measurement'))}: "
                f"{m.get('value', 'N/A')} {m.get('unit', 'mm')}"
            )
    else:
        lines.append("   No measurements recorded.")

    # 9. Implant details & positioning
    implant = case_data.get("implantPlan") or {}
    lines.append("")
    lines.append("7. IMPLANT DETAILS & POSITIONING")
    if implant and implant.get("implantName"):
        lines.append(f"   Implant: {implant.get('implantName')} | Position (mm): {implant.get('positionMm')}")
        lines.append(f"   Rotation (deg): {implant.get('rotationDeg')}")
    else:
        lines.append("   No implant plan saved.")

    # 11. Digital twin version & 13. Clinical review notes
    lines.append("")
    lines.append("8. CLINICAL REVIEW NOTES & LIMITATIONS")
    lines.append(f"   Notes: {case_data.get('clinicalNotes') or 'None recorded.'}")
    lines.append("   DISCLAIMER: This report is an engineering/decision-support output and is NOT")
    lines.append("   an independently validated clinical diagnosis or surgical clearance.")
    return lines


def generate_case_pdf_bytes(case_data: Dict[str, Any], user_role: str = "doctor") -> bytes:
    lines = _build_report_lines(case_data, user_role)
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        width, height = letter
        y = height - 48
        c.setFont("Helvetica-Bold", 11)
        for idx, line in enumerate(lines):
            if y < 48:
                c.showPage()
                y = height - 48
            c.setFont("Helvetica-Bold" if idx == 0 or line.endswith(")") or line.endswith("SUMMARY") or line.endswith("STATUS") or line.endswith("STATISTICS") or line.endswith("POSITIONING") or line.endswith("LIMITATIONS") else "Helvetica", 9.5)
            c.drawString(42, y, line[:105])
            y -= 14
        c.save()
        return buf.getvalue()
    except ImportError:
        # Pure-Python minimal valid PDF 1.4 fallback
        escaped_ops = ["BT", "/F1 9 Tf", "40 750 Td", "13 TL"]
        for line in lines[:52]:
            safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            escaped_ops.append(f"({safe}) Tj T*")
        escaped_ops.append("ET")
        stream_bytes = "\n".join(escaped_ops).encode("latin-1", errors="replace")

        objs = [
            b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
            f"4 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("ascii") + stream_bytes + b"\nendstream\nendobj\n",
            b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        ]
        out = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for obj in objs:
            offsets.append(len(out))
            out.extend(obj)
        xref_pos = len(out)
        out.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("ascii"))
        for off in offsets[1:]:
            out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        out.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii"))
        return bytes(out)
