"""
Dataset Readiness and Inventory Module for ShoulderTwin.

Scans local DICOM CT directories and saved segmentation masks in read-only mode
to produce an anonymized JSON dataset readiness report.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import numpy as np

from backend.app.services.dicom_service import DicomValidationError, load_volume_from_files


def anonymize_case_id(raw_case_id: str) -> str:
    """Return a deterministic, anonymized case identifier (no direct patient/case names)."""
    digest = hashlib.sha256(raw_case_id.strip().encode("utf-8")).hexdigest()[:10].upper()
    return f"ANON-{digest}"


def _find_dicom_files(case_dir: str) -> List[str]:
    """Return sorted paths to .dcm files in a case directory without modifying them."""
    dcm_files: List[str] = []
    for entry in sorted(os.listdir(case_dir)):
        full_path = os.path.join(case_dir, entry)
        if os.path.isfile(full_path) and entry.lower().endswith(".dcm"):
            dcm_files.append(full_path)
    return dcm_files


def _find_mask_files(case_dir: str) -> List[str]:
    """Return sorted paths to segmentation mask files (.npz, .npy, .nii, .nii.gz)."""
    mask_exts = (".npz", ".npy", ".nii", ".nii.gz")
    masks: List[str] = []
    for entry in sorted(os.listdir(case_dir)):
        full_path = os.path.join(case_dir, entry)
        if os.path.isfile(full_path) and entry.lower().endswith(mask_exts):
            masks.append(full_path)
    return masks


def inspect_case_directory(case_dir: str, raw_case_id: str) -> Dict[str, Any]:
    """Inspect a single case directory in read-only mode and return readiness metadata."""
    anon_id = anonymize_case_id(raw_case_id)
    issues: List[str] = []

    dcm_files = _find_dicom_files(case_dir)
    mask_files = _find_mask_files(case_dir)

    volume_shape: Optional[List[int]] = None
    voxel_spacing_mm: Optional[List[float]] = None
    orientation: Optional[List[float]] = None
    hu_range: Optional[List[float]] = None

    if not dcm_files:
        issues.append("missing_dicom_files")
    else:
        try:
            volume, analysis = load_volume_from_files(dcm_files)
            volume_shape = [int(v) for v in volume.shape]
            voxel_spacing_mm = [round(float(s), 4) for s in analysis.get("spacingMm", [])]
            orientation = [round(float(o), 5) for o in analysis.get("orientation", [])]
            hu_range = [round(float(np.min(volume)), 2), round(float(np.max(volume)), 2)]
        except (DicomValidationError, OSError, ValueError) as exc:
            issues.append(f"missing_or_invalid_metadata: {exc}")

    mask_format: Optional[str] = None
    has_separate_scapula_humerus = False
    shape_matches_volume: Optional[bool] = None
    is_automatic_threshold_mask = False

    if not mask_files:
        issues.append("missing_mask")
    else:
        primary_mask_path = mask_files[0]
        lower_name = primary_mask_path.lower()
        mask_format = ".nii.gz" if lower_name.endswith(".nii.gz") else os.path.splitext(primary_mask_path)[1].lower()

        if mask_format == ".npz":
            try:
                with np.load(primary_mask_path) as archive:
                    keys = set(archive.files)
                    has_scap = "scapula_mask" in keys and bool(archive["scapula_mask"].any())
                    has_hum = "humerus_mask" in keys and bool(archive["humerus_mask"].any())
                    has_separate_scapula_humerus = has_scap and has_hum
                    is_automatic_threshold_mask = "thresholdHu" in keys or "auto_mask" in keys

                    ref_key = "mask" if "mask" in keys else ("scapula_mask" if "scapula_mask" in keys else None)
                    if ref_key is not None:
                        mask_shape = [int(v) for v in archive[ref_key].shape]
                        if not bool(archive[ref_key].any()):
                            issues.append("empty_mask")
                        if volume_shape is not None:
                            shape_matches_volume = mask_shape == volume_shape
                            if not shape_matches_volume:
                                issues.append(f"mismatched_shape: volume={volume_shape} vs mask={mask_shape}")
                    else:
                        issues.append("missing_mask_array_in_npz")
            except (OSError, ValueError) as exc:
                issues.append(f"unreadable_mask: {exc}")

    ready_for_training = (
        len(issues) == 0
        and volume_shape is not None
        and has_separate_scapula_humerus
        and shape_matches_volume is True
    )

    return {
        "anonymizedCaseId": anon_id,
        "sliceCount": len(dcm_files),
        "imageDimensions": volume_shape,
        "voxelSpacingMm": voxel_spacing_mm,
        "orientation": orientation,
        "huRange": hu_range,
        "maskCount": len(mask_files),
        "maskFormat": mask_format,
        "hasSeparateScapulaAndHumerus": has_separate_scapula_humerus,
        "shapeMatchesVolume": shape_matches_volume,
        "isAutomaticThresholdMask": is_automatic_threshold_mask,
        "groundTruthVerified": False,
        "readyForTraining": ready_for_training,
        "issues": issues,
    }


def generate_dataset_inventory(
    data_dir: str = "data",
    output_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Scan `<data_dir>/dicom` in read-only mode and generate an anonymized JSON
    dataset readiness report.
    """
    dicom_root = os.path.join(data_dir, "dicom")
    cases_report: List[Dict[str, Any]] = []
    seen_ids: Dict[str, int] = {}
    duplicate_ids: List[str] = []

    if os.path.isdir(dicom_root):
        for entry in sorted(os.listdir(dicom_root)):
            case_dir = os.path.join(dicom_root, entry)
            if not os.path.isdir(case_dir):
                continue
            normalized_key = entry.strip().lower()
            seen_ids[normalized_key] = seen_ids.get(normalized_key, 0) + 1
            case_info = inspect_case_directory(case_dir, entry)
            if seen_ids[normalized_key] > 1:
                case_info["issues"].append("duplicate_case_id")
                case_info["readyForTraining"] = False
                duplicate_ids.append(case_info["anonymizedCaseId"])
            cases_report.append(case_info)

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalCases": len(cases_report),
        "casesWithSeparateScapulaAndHumerus": sum(
            1 for c in cases_report if c["hasSeparateScapulaAndHumerus"]
        ),
        "casesReadyForTraining": sum(1 for c in cases_report if c["readyForTraining"]),
        "duplicateCaseIds": duplicate_ids,
        "notes": (
            "Automatically generated HU-threshold masks are NOT ground-truth labels "
            "and require clinician/annotator verification before supervised training."
        ),
        "cases": cases_report,
    }

    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate ShoulderTwin CT dataset readiness report.")
    parser.add_argument("--data-dir", default="data", help="Root data directory containing dicom/<case_id>/")
    parser.add_argument("--output", default="data/dataset_inventory.json", help="Output JSON report path")
    args = parser.parse_args()
    report = generate_dataset_inventory(data_dir=args.data_dir, output_path=args.output)
    print(f"Scanned {report['totalCases']} case(s). Report saved to {args.output}")


if __name__ == "__main__":
    main()
