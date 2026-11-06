"""Unit tests for the ShoulderTwin dataset readiness and inventory module."""
import os
import numpy as np

from backend.ml.datasets.inventory import anonymize_case_id, generate_dataset_inventory
from backend.tests.test_dicom import create_synthetic_dicom_bytes


def test_dataset_inventory_read_only_and_validation(tmp_path):
    dicom_root = tmp_path / "dicom"

    # 1. Valid case with separate scapula & humerus masks
    valid_dir = dicom_root / "PATIENT_JOHN_DOE_01"
    valid_dir.mkdir(parents=True)
    for idx in range(2):
        dcm_bytes = create_synthetic_dicom_bytes(
            rows=16,
            cols=16,
            instance_number=idx + 1,
            image_position_patient=[0.0, 0.0, float(idx * 2.0)],
        )
        (valid_dir / f"slice_{idx}.dcm").write_bytes(dcm_bytes)

    scap = np.zeros((2, 16, 16), dtype=np.uint8)
    hum = np.zeros((2, 16, 16), dtype=np.uint8)
    scap[0, 2:6, 2:6] = 1
    hum[1, 8:12, 8:12] = 1
    np.savez_compressed(
        valid_dir / "seg_001.npz",
        mask=(scap | hum),
        scapula_mask=scap,
        humerus_mask=hum,
        thresholdHu=300.0,
    )

    # 2. Case with missing mask
    no_mask_dir = dicom_root / "CASE_NO_MASK"
    no_mask_dir.mkdir(parents=True)
    for idx in range(2):
        (no_mask_dir / f"slice_{idx}.dcm").write_bytes(
            create_synthetic_dicom_bytes(rows=16, cols=16, instance_number=idx + 1)
        )

    # 3. Case with mismatched mask shape
    bad_shape_dir = dicom_root / "CASE_BAD_SHAPE"
    bad_shape_dir.mkdir(parents=True)
    for idx in range(2):
        (bad_shape_dir / f"slice_{idx}.dcm").write_bytes(
            create_synthetic_dicom_bytes(rows=16, cols=16, instance_number=idx + 1)
        )
    np.savez_compressed(
        bad_shape_dir / "seg_bad.npz",
        mask=np.ones((2, 8, 8), dtype=np.uint8),
    )

    out_json = tmp_path / "inventory.json"
    report = generate_dataset_inventory(data_dir=str(tmp_path), output_path=str(out_json))

    assert os.path.isfile(out_json)
    assert report["totalCases"] == 3
    assert report["casesWithSeparateScapulaAndHumerus"] == 1
    assert report["casesReadyForTraining"] == 1

    # Ensure no direct patient/case names appear anywhere in the serialized JSON
    raw_text = out_json.read_text(encoding="utf-8")
    assert "PATIENT_JOHN_DOE_01" not in raw_text
    assert anonymize_case_id("PATIENT_JOHN_DOE_01") in raw_text

    by_id = {c["anonymizedCaseId"]: c for c in report["cases"]}
    valid_case = by_id[anonymize_case_id("PATIENT_JOHN_DOE_01")]
    assert valid_case["imageDimensions"] == [2, 16, 16]
    assert valid_case["isAutomaticThresholdMask"] is True
    assert valid_case["groundTruthVerified"] is False
    assert valid_case["readyForTraining"] is True

    no_mask_case = by_id[anonymize_case_id("CASE_NO_MASK")]
    assert "missing_mask" in no_mask_case["issues"]
    assert no_mask_case["readyForTraining"] is False

    bad_shape_case = by_id[anonymize_case_id("CASE_BAD_SHAPE")]
    assert any(i.startswith("mismatched_shape") for i in bad_shape_case["issues"])
    assert bad_shape_case["readyForTraining"] is False
