"""
DICOM Processing Service for Digital Twin of the Shoulder.

Provides safe DICOM parsing, geometry validation, privacy stripping,
Hounsfield unit scaling, and slice preview rendering using pydicom, numpy, and Pillow.
"""

import base64
import io
import math
import os
import struct
import uuid
from typing import Any, Dict, List, Optional, Tuple

try:
    import pydicom
    from pydicom.dataset import FileDataset
    PYDICOM_AVAILABLE = True
except ImportError:
    PYDICOM_AVAILABLE = False

try:
    import numpy as np
    from PIL import Image
    IMAGING_AVAILABLE = True
except ImportError:
    IMAGING_AVAILABLE = False


class DicomValidationError(ValueError):
    """Raised when an uploaded file is not a valid or readable DICOM."""
    pass


def validate_dicom_preamble(file_bytes: bytes) -> bool:
    """Check standard 128-byte preamble + 4-byte 'DICM' signature."""
    if len(file_bytes) < 132:
        return False
    return file_bytes[128:132] == b"DICM"


def parse_dicom_dataset(file_bytes: bytes, filename: str = "upload.dcm") -> Any:
    """Safely parse DICOM bytes with pydicom, handling both preamble and preamble-less files."""
    if not PYDICOM_AVAILABLE:
        raise DicomValidationError(
            "pydicom is not installed on the backend server. Install pydicom to enable real DICOM parsing."
        )

    try:
        buffer = io.BytesIO(file_bytes)
        # First attempt standard parse
        try:
            ds = pydicom.dcmread(buffer, force=False)
        except Exception:
            # If standard fails, try force=True for headerless/legacy PACS DICOM files
            buffer.seek(0)
            ds = pydicom.dcmread(buffer, force=True)

        # Validate that essential attributes or pixel data exist
        if not hasattr(ds, "SOPClassUID") and not hasattr(ds, "Modality") and not hasattr(ds, "PixelData"):
            raise DicomValidationError(f"File '{filename}' does not contain recognized DICOM elements or pixel data.")

        return ds
    except Exception as exc:
        raise DicomValidationError(f"Failed to read DICOM '{filename}': {str(exc)}") from exc


def extract_safe_metadata(ds: Any, filename: str, file_size_bytes: int) -> Dict[str, Any]:
    """
    Extract clinically relevant CT acquisition and geometry parameters.
    PRIVACY GUARANTEE: Excludes PatientName, PatientID, PatientBirthDate,
    ReferringPhysicianName, and InstitutionName.
    """
    def _get_val(tag_name: str, default=None):
        val = ds.get(tag_name, default)
        if val is None:
            return default
        # Handle pydicom MultiValue or PersonName
        if hasattr(val, "original_string"):
            return str(val)
        return val

    # Helper for window center/width which may be list or single value
    def _get_scalar_float(tag_name: str, default: float) -> float:
        val = ds.get(tag_name, default)
        if val is None:
            return default
        if hasattr(val, "__iter__") and not isinstance(val, (str, bytes)):
            try:
                return float(val[0])
            except (IndexError, ValueError):
                return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    modality = str(_get_val("Modality", "CT")).upper()
    rows = int(_get_val("Rows", 512))
    cols = int(_get_val("Columns", 512))

    # Pixel spacing [row_spacing, col_spacing] in mm
    raw_spacing = ds.get("PixelSpacing", None)
    if raw_spacing and len(raw_spacing) >= 2:
        pixel_spacing = [float(raw_spacing[0]), float(raw_spacing[1])]
    else:
        pixel_spacing = [1.0, 1.0]

    slice_thickness = float(_get_val("SliceThickness", 1.0) or 1.0)

    # Orientation & Position vectors
    raw_pos = ds.get("ImagePositionPatient", None)
    image_pos = [float(x) for x in raw_pos] if raw_pos and len(raw_pos) >= 3 else None

    raw_orient = ds.get("ImageOrientationPatient", None)
    image_orient = [float(x) for x in raw_orient] if raw_orient and len(raw_orient) >= 6 else None

    # Slice Location
    slice_location = None
    if "SliceLocation" in ds:
        try:
            slice_location = float(ds.SliceLocation)
        except (ValueError, TypeError):
            pass
    if slice_location is None and image_pos is not None:
        slice_location = image_pos[2]

    # Rescale Slope & Intercept for Hounsfield Units
    rescale_intercept = float(_get_val("RescaleIntercept", 0.0) or 0.0)
    rescale_slope = float(_get_val("RescaleSlope", 1.0) or 1.0)

    window_center = _get_scalar_float("WindowCenter", 450.0)
    window_width = _get_scalar_float("WindowWidth", 1500.0)

    series_uid = str(_get_val("SeriesInstanceUID", ""))
    study_uid = str(_get_val("StudyInstanceUID", ""))
    sop_uid = str(_get_val("SOPInstanceUID", ""))
    instance_number = int(_get_val("InstanceNumber", 1) or 1)

    kvp = float(_get_val("KVP", 120.0) or 120.0)
    tube_current = float(_get_val("XRayTubeCurrent", 200.0) or 200.0)
    kernel = str(_get_val("ConvolutionKernel", "BONE_SHARP"))
    acquisition_date = str(_get_val("AcquisitionDate", ""))

    return {
        "filename": filename,
        "fileSizeBytes": file_size_bytes,
        "modality": modality,
        "seriesInstanceUid": series_uid,
        "studyInstanceUid": study_uid,
        "sopInstanceUid": sop_uid,
        "instanceNumber": instance_number,
        "rows": rows,
        "columns": cols,
        "pixelSpacingMm": pixel_spacing,
        "sliceThicknessMm": slice_thickness,
        "sliceLocation": slice_location,
        "imagePositionPatient": image_pos,
        "imageOrientationPatient": image_orient,
        "rescaleIntercept": rescale_intercept,
        "rescaleSlope": rescale_slope,
        "windowCenter": window_center,
        "windowWidth": window_width,
        "kvp": kvp,
        "tubeCurrentMa": tube_current,
        "reconstructionKernel": kernel,
        "acquisitionDate": acquisition_date,
        "hasPixelData": hasattr(ds, "PixelData") and len(ds.PixelData) > 0,
    }


def render_slice_preview_base64(ds: Any, target_size: int = 512) -> Optional[str]:
    """
    Render genuine DICOM pixel array to an 8-bit PNG encoded as base64 data URL.
    Applies rescale slope/intercept and calibrated windowing (Bone / Soft Tissue).
    """
    if not IMAGING_AVAILABLE:
        return None

    if not hasattr(ds, "pixel_array"):
        return None

    try:
        pixel_array = ds.pixel_array.astype(np.float32)

        # Apply Rescale Slope / Intercept -> Hounsfield Units (HU)
        slope = float(getattr(ds, "RescaleSlope", 1.0) or 1.0)
        intercept = float(getattr(ds, "RescaleIntercept", 0.0) or 0.0)
        hu = pixel_array * slope + intercept

        # Determine window center and width (default to bone window if missing)
        try:
            wc = getattr(ds, "WindowCenter", 450)
            if hasattr(wc, "__iter__"):
                wc = wc[0]
            wc = float(wc)
        except Exception:
            wc = 450.0

        try:
            ww = getattr(ds, "WindowWidth", 1500)
            if hasattr(ww, "__iter__"):
                ww = ww[0]
            ww = float(ww)
        except Exception:
            ww = 1500.0

        if ww <= 0:
            ww = 1500.0

        # Windowing calculation
        min_val = wc - (ww / 2.0)
        max_val = wc + (ww / 2.0)

        windowed = np.clip((hu - min_val) / (max_val - min_val), 0.0, 1.0) * 255.0
        uint8_slice = windowed.astype(np.uint8)

        # Invert for MONOCHROME1 where minimum pixel value represents white
        photometric = getattr(ds, "PhotometricInterpretation", "MONOCHROME2")
        if photometric == "MONOCHROME1":
            uint8_slice = 255 - uint8_slice

        img = Image.fromarray(uint8_slice)
        if img.width != target_size or img.height != target_size:
            img = img.resize((target_size, target_size), Image.Resampling.BILINEAR)

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        encoded = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{encoded}"
    except Exception as err:
        # If rendering fails (e.g. uncompressed codec missing), return None safely
        return None


def calculate_slice_position(meta: Dict[str, Any]) -> Tuple[int, float]:
    """
    Compute physical distance along the scan normal vector according to DICOM geometry.
    Returns (priority, position_in_mm).
    Priority 0 = full vector projection, 1 = sliceLocation, 2 = instanceNumber.
    """
    orient = meta.get("imageOrientationPatient")
    pos = meta.get("imagePositionPatient")
    if orient and len(orient) == 6 and pos and len(pos) == 3:
        rx, ry, rz = orient[0], orient[1], orient[2]
        cx, cy, cz = orient[3], orient[4], orient[5]
        # Cross product: normal = row_dir x col_dir
        nx = ry * cz - rz * cy
        ny = rz * cx - rx * cz
        nz = rx * cy - ry * cx
        norm = math.sqrt(nx * nx + ny * ny + nz * nz)
        if norm > 1e-6:
            proj = (pos[0] * nx + pos[1] * ny + pos[2] * nz) / norm
            return (0, proj)

    if meta.get("sliceLocation") is not None:
        return (1, float(meta["sliceLocation"]))

    return (2, float(meta.get("instanceNumber", 0)))


def analyze_dicom_series(
    parsed_slices: List[Tuple[Dict[str, Any], Optional[str]]],
) -> Dict[str, Any]:
    """
    Validate, deduplicate, physically sort, and evaluate 3D volume continuity
    of a collection of parsed DICOM slices.

    Raises DicomValidationError if series integrity is violated (e.g. mismatched series UIDs).
    """
    if not parsed_slices:
        raise DicomValidationError("Cannot analyze empty DICOM series.")

    # 1. Series uniformity validation
    series_map: Dict[str, List[Tuple[Dict[str, Any], Optional[str]]]] = {}
    for meta, preview in parsed_slices:
        uid = meta.get("seriesInstanceUid") or "UNKNOWN_SERIES"
        series_map.setdefault(uid, []).append((meta, preview))

    if len(series_map) > 1 and "UNKNOWN_SERIES" not in series_map:
        keys_summary = ", ".join(list(series_map.keys())[:3])
        raise DicomValidationError(
            f"Uploaded files belong to {len(series_map)} distinct SeriesInstanceUIDs ({keys_summary}). "
            f"All slices must belong to a single contiguous CT acquisition series."
        )

    # 2. Modality consistency validation
    modalities = {meta.get("modality", "").upper() for meta, _ in parsed_slices}
    if any(m not in ("CT", "OCT", "PT") and not m.startswith("CT") for m in modalities if m):
        invalid_mods = ", ".join(m for m in modalities if m not in ("CT", "OCT", "PT") and not m.startswith("CT"))
        raise DicomValidationError(
            f"Incompatible modality detected: {invalid_mods}. Only axial CT acquisition series are supported "
            f"for glenohumeral 3D digital twin reconstruction."
        )

    # 3. Deduplication by SOPInstanceUID
    seen_sops: Dict[str, Tuple[Dict[str, Any], Optional[str]]] = {}
    deduped_slices: List[Tuple[Dict[str, Any], Optional[str]]] = []
    duplicate_count = 0

    for meta, preview in parsed_slices:
        sop_uid = meta.get("sopInstanceUid")
        if sop_uid and sop_uid in seen_sops:
            duplicate_count += 1
            continue
        if sop_uid:
            seen_sops[sop_uid] = (meta, preview)
        deduped_slices.append((meta, preview))

    # 4. Physical sorting along scan axis
    def _sort_key(item: Tuple[Dict[str, Any], Optional[str]]) -> Tuple[int, float]:
        return calculate_slice_position(item[0])

    deduped_slices.sort(key=_sort_key)

    # Attach computed normal projection to each slice metadata
    for meta, _ in deduped_slices:
        prio, val = calculate_slice_position(meta)
        meta["physicalPositionMm"] = round(val, 3)

    primary_meta = deduped_slices[0][0]
    slice_count = len(deduped_slices)

    # A CT volume must have a consistent acquisition geometry. Missing geometry
    # is not safe to silently replace with defaults for reconstruction.
    orientations = [
        tuple(round(float(value), 5) for value in meta.get("imageOrientationPatient", []))
        for meta, _ in deduped_slices
    ]
    if any(len(orientation) != 6 for orientation in orientations):
        raise DicomValidationError(
            "The series is missing ImageOrientationPatient on one or more slices; "
            "physical orientation cannot be established."
        )
    first_orientation = orientations[0]
    if any(orientation != first_orientation for orientation in orientations[1:]):
        raise DicomValidationError("The uploaded series has inconsistent image orientation vectors.")

    spacings = [
        tuple(round(float(value), 5) for value in meta.get("pixelSpacingMm", []))
        for meta, _ in deduped_slices
    ]
    if any(len(spacing) != 2 or any(value <= 0 for value in spacing) for spacing in spacings):
        raise DicomValidationError("The series contains missing or invalid pixel spacing.")
    if any(spacing != spacings[0] for spacing in spacings[1:]):
        raise DicomValidationError("The uploaded series has inconsistent pixel spacing.")
    dimensions = {(meta.get("rows"), meta.get("columns")) for meta, _ in deduped_slices}
    if len(dimensions) != 1:
        raise DicomValidationError("The uploaded series has inconsistent image dimensions.")

    # 5. Spacing, Gaps, and Bounding Volume calculations
    spacings: List[float] = []
    gap_warnings: List[str] = []
    has_gaps = False

    if slice_count >= 2:
        for i in range(len(deduped_slices) - 1):
            curr_pos = deduped_slices[i][0]["physicalPositionMm"]
            next_pos = deduped_slices[i + 1][0]["physicalPositionMm"]
            step = abs(next_pos - curr_pos)
            spacings.append(step)

        nonzero_spacings = [s for s in spacings if s > 0.01]
        if nonzero_spacings:
            nominal_spacing = float(np.median(nonzero_spacings)) if IMAGING_AVAILABLE else (sum(nonzero_spacings) / len(nonzero_spacings))
        else:
            nominal_spacing = float(primary_meta.get("sliceThicknessMm", 1.0))

        # Check for gaps > 1.8x nominal spacing
        for i, step in enumerate(spacings):
            if nominal_spacing > 0 and step > (1.8 * nominal_spacing):
                has_gaps = True
                gap_warnings.append(
                    f"Gap of {step:.2f} mm detected between slice {i+1} and {i+2} (expected ~{nominal_spacing:.2f} mm)."
                )

        first_pos = deduped_slices[0][0]["physicalPositionMm"]
        last_pos = deduped_slices[-1][0]["physicalPositionMm"]
        z_coverage_mm = abs(last_pos - first_pos) + float(primary_meta.get("sliceThicknessMm", 1.0))
    else:
        nominal_spacing = float(primary_meta.get("sliceThicknessMm", 1.0))
        z_coverage_mm = nominal_spacing

    col_spacing = float(primary_meta.get("pixelSpacingMm", [1.0, 1.0])[1])
    row_spacing = float(primary_meta.get("pixelSpacingMm", [1.0, 1.0])[0])
    x_span_mm = round(primary_meta.get("columns", 512) * col_spacing, 2)
    y_span_mm = round(primary_meta.get("rows", 512) * row_spacing, 2)
    z_span_mm = round(z_coverage_mm, 2)

    # 6. Reconstruction feasibility
    is_volumetric = slice_count >= 30 and not has_gaps
    if slice_count == 1:
        readiness = "single_slice_preview_only"
        recon_msg = (
            f"Single 2D axial slice loaded ({primary_meta['rows']}×{primary_meta['columns']} px, "
            f"{primary_meta['sliceThicknessMm']:.1f} mm). Volumetric 3D cortical reconstruction requires "
            f"a complete contiguous CT series (typically 120–250 contiguous slices). "
            f"Current slice is rendered in the CT multi-planar view."
        )
    elif slice_count < 30:
        readiness = "partial_series_insufficient"
        recon_msg = (
            f"Incomplete series ({slice_count} slices, {z_span_mm:.1f} mm scan length). "
            f"High-fidelity glenohumeral 3D reconstruction requires a full anatomical series spanning "
            f"the acromion to the mid-humeral diaphysis (>=30 slices)."
        )
    elif has_gaps:
        readiness = "volumetric_with_gaps"
        recon_msg = (
            f"Volumetric series loaded with {slice_count} slices, but {len(gap_warnings)} spacing irregularity/gap(s) "
            f"were identified. Mesh interpolation may exhibit stair-step artifacts."
        )
    else:
        readiness = "volumetric_reconstruction_ready"
        recon_msg = (
            f"Valid volumetric CT series ({slice_count} contiguous slices, spacing {nominal_spacing:.2f} mm, "
            f"scan span {z_span_mm:.1f} mm). Ready for 3D surface mesh generation."
        )

    return {
        "sorted_slices": deduped_slices,
        "sliceCount": slice_count,
        "duplicateCount": duplicate_count,
        "sliceSpacingMm": round(nominal_spacing, 3),
        "zCoverageMm": z_span_mm,
        "volumeDimensionsMm": [x_span_mm, y_span_mm, z_span_mm],
        "hasGaps": has_gaps,
        "gapWarnings": gap_warnings,
        "isVolumetricSeries": is_volumetric,
        "reconstructionReadiness": readiness,
        "reconstructionMessage": recon_msg,
    }


def load_volume_from_files(
    file_paths: List[str],
) -> Tuple[Any, Dict[str, Any]]:
    """Load an ordered CT volume and its physical geometry from unchanged DICOM files."""
    if not PYDICOM_AVAILABLE or not IMAGING_AVAILABLE:
        raise DicomValidationError("pydicom and numpy are required for CT volume reconstruction.")
    parsed: List[Tuple[Dict[str, Any], Optional[str]]] = []
    datasets: Dict[str, Any] = {}
    for path in file_paths:
        with open(path, "rb") as source:
            ds = parse_dicom_dataset(source.read(), filename=os.path.basename(path))
        meta = extract_safe_metadata(ds, os.path.basename(path), os.path.getsize(path))
        parsed.append((meta, None))
        datasets[meta["sopInstanceUid"]] = ds
    analysis = analyze_dicom_series(parsed)
    ordered = analysis["sorted_slices"]
    arrays = []
    for meta, _ in ordered:
        ds = datasets.get(meta["sopInstanceUid"])
        if ds is None or not hasattr(ds, "pixel_array"):
            raise DicomValidationError(f"Slice '{meta['filename']}' has no readable pixel data.")
        values = ds.pixel_array.astype(np.float32)
        values = values * float(meta["rescaleSlope"]) + float(meta["rescaleIntercept"])
        arrays.append(values)
    volume = np.stack(arrays, axis=0)
    analysis["originMm"] = ordered[0][0].get("imagePositionPatient")
    analysis["orientation"] = ordered[0][0].get("imageOrientationPatient")
    analysis["spacingMm"] = [
        float(ordered[0][0]["sliceSpacingMm"]) if "sliceSpacingMm" in ordered[0][0] else float(analysis["sliceSpacingMm"]),
        float(ordered[0][0]["pixelSpacingMm"][0]),
        float(ordered[0][0]["pixelSpacingMm"][1]),
    ]
    return volume, analysis


def extract_patient_space_mesh(
    volume: Any,
    analysis: Dict[str, Any],
    threshold_hu: float = 300.0,
) -> Tuple[bytes, Dict[str, Any]]:
    """Extract a binary STL from actual CT voxels in patient coordinates."""
    if not IMAGING_AVAILABLE:
        raise DicomValidationError("numpy is required for CT reconstruction.")
    try:
        from skimage.measure import marching_cubes
    except ImportError as exc:
        raise DicomValidationError(
            "scikit-image is not installed; marching-cubes reconstruction is unavailable."
        ) from exc

    mask = volume >= threshold_hu
    voxel_count = int(mask.sum())
    if voxel_count == 0:
        raise DicomValidationError(
            f"Segmentation is empty at threshold {threshold_hu:.1f} HU; lower the threshold or upload a bone CT series."
        )
    if voxel_count == int(mask.size):
        raise DicomValidationError("Segmentation fills the entire volume; the threshold is not suitable for reconstruction.")
    if min(mask.shape) < 2:
        raise DicomValidationError("The CT volume is too small for surface extraction.")

    spacing = analysis["spacingMm"]
    vertices, faces, normals, _ = marching_cubes(mask.astype(np.uint8), level=0.5, spacing=spacing)
    orientation = np.asarray(analysis["orientation"], dtype=np.float64)
    row_direction = orientation[:3]
    column_direction = orientation[3:]
    normal_direction = np.cross(row_direction, column_direction)
    origin = np.asarray(analysis["originMm"], dtype=np.float64)
    # marching_cubes axes are [slice, row, column].
    transform = np.column_stack((normal_direction, row_direction, column_direction))
    vertices = origin + vertices @ transform.T

    header = b"ShoulderTwin patient CT reconstruction".ljust(80, b"\0")
    output = io.BytesIO()
    output.write(header)
    output.write(struct.pack("<I", len(faces)))
    for face in faces:
        normal = normals[face].mean(axis=0)
        normal_length = float(np.linalg.norm(normal))
        if normal_length:
            normal = normal / normal_length
        output.write(struct.pack("<3f", *normal))
        for vertex_index in face:
            output.write(struct.pack("<3f", *vertices[vertex_index]))
        output.write(struct.pack("<H", 0))
    mesh_bytes = output.getvalue()
    mins = vertices.min(axis=0)
    maxs = vertices.max(axis=0)
    stats = {
        "vertexCount": int(len(vertices)),
        "triangleCount": int(len(faces)),
        "faceCount": int(len(faces)),
        "voxelCount": voxel_count,
        "thresholdHu": threshold_hu,
        "boundingBox": {
            "x": round(float(maxs[0] - mins[0]), 3),
            "y": round(float(maxs[1] - mins[1]), 3),
            "z": round(float(maxs[2] - mins[2]), 3),
        },
        "physicalCoordinateSystem": "DICOM patient LPS",
    }
    return mesh_bytes, stats
