import io
import tempfile
import os
import pytest
import numpy as np
from fastapi.testclient import TestClient
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage

from backend.app.main import app
from backend.app.storage.sqlite import SqliteCaseStore
import backend.app.storage as storage_module
import backend.app.dependencies as deps_module
import backend.app.routers.cases as cases_router
import backend.app.routers.imaging as imaging_router
import backend.app.routers.auth as auth_router

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_test_database():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    test_store = SqliteCaseStore(db_path=temp_db_path)
    orig_storage_store = storage_module.case_store
    orig_cases_store = cases_router.case_store
    orig_imaging_store = imaging_router.case_store
    orig_deps_store = deps_module.case_store
    orig_auth_store = auth_router.case_store

    storage_module.case_store = test_store
    cases_router.case_store = test_store
    imaging_router.case_store = test_store
    deps_module.case_store = test_store
    auth_router.case_store = test_store

    yield test_store

    storage_module.case_store = orig_storage_store
    cases_router.case_store = orig_cases_store
    imaging_router.case_store = orig_imaging_store
    deps_module.case_store = orig_deps_store
    auth_router.case_store = orig_auth_store
    if os.path.exists(temp_db_path):
        try:
            os.remove(temp_db_path)
        except OSError:
            pass


@pytest.fixture
def auth_headers(isolated_test_database):
    doc = isolated_test_database.get_user_by_email("doctor@shouldertwin.org")
    token, _ = isolated_test_database.create_session(user_id=doc["id"])
    return {"Authorization": f"Bearer {token}"}



def create_synthetic_dicom_bytes(
    rows=64,
    cols=64,
    thickness=1.0,
    series_uid="1.2.826.0.1.3680043.8.498.1.1",
    sop_uid=None,
    instance_number=1,
    slice_location=None,
    image_position_patient=None,
    image_orientation_patient=None,
    modality="CT",
) -> bytes:
    """Helper to generate valid synthetic DICOM bytes with customizable CT metadata."""
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    file_meta.MediaStorageSOPInstanceUID = sop_uid or f"1.2.826.0.1.3680043.8.498.1.{instance_number}"
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset("test.dcm", {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.Modality = modality
    ds.SeriesInstanceUID = series_uid
    ds.StudyInstanceUID = "1.2.826.0.1.3680043.8.498.1.2"
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.InstanceNumber = instance_number
    ds.PatientID = "ANON-TEST-01"
    ds.PatientName = "Anonymized^Shoulder"
    ds.Rows = rows
    ds.Columns = cols
    ds.SliceThickness = thickness
    ds.PixelSpacing = [0.75, 0.75]
    ds.KVP = 120.0
    ds.ConvolutionKernel = "BONE"
    ds.RescaleSlope = 1.0
    ds.RescaleIntercept = -1024.0
    ds.WindowCenter = 400.0
    ds.WindowWidth = 1500.0
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 1  # signed 16-bit
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"

    if slice_location is not None:
        ds.SliceLocation = slice_location

    if image_position_patient is not None:
        ds.ImagePositionPatient = image_position_patient
    elif slice_location is not None:
        ds.ImagePositionPatient = [0.0, 0.0, float(slice_location)]

    if image_orientation_patient is not None:
        ds.ImageOrientationPatient = image_orientation_patient
    else:
        ds.ImageOrientationPatient = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0]

    # Synthetic bone circle pattern in HU
    pixel_array = np.full((rows, cols), -1000, dtype=np.int16)
    cy, cx = rows // 2, cols // 2
    y, x = np.ogrid[:rows, :cols]
    mask = (x - cx) ** 2 + (y - cy) ** 2 <= (min(rows, cols) // 4) ** 2
    pixel_array[mask] = 800  # Cortical bone ~800 HU

    # Stored pixel values = (HU - RescaleIntercept) / RescaleSlope
    stored = ((pixel_array - (-1024.0)) / 1.0).astype(np.uint16)
    ds.PixelData = stored.tobytes()

    buf = io.BytesIO()
    ds.save_as(buf)
    return buf.getvalue()


def test_upload_dicom_no_files():
    # Calling multipart endpoint without files field triggers validation error
    res = client.post("/api/imaging/upload", files=[])
    assert res.status_code == 422


def test_upload_invalid_non_dicom_file(auth_headers):
    invalid_bytes = b"This is a plaintext file, not a valid DICOM file header."
    files = [("files", ("test.txt", invalid_bytes, "application/octet-stream"))]
    res = client.post("/api/imaging/upload", files=files, headers=auth_headers)
    assert res.status_code == 400
    assert "too small to be a valid DICOM" in res.json()["detail"]


def test_upload_valid_single_slice_dicom(auth_headers):
    dcm_bytes = create_synthetic_dicom_bytes(rows=64, cols=64, thickness=1.0)
    files = [("files", ("VHFCT1mm-Shoulder.dcm", dcm_bytes, "application/dicom"))]

    res = client.post("/api/imaging/upload", files=files, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()

    assert data["success"] is True
    assert data["fileCount"] == 1
    assert data["sliceCount"] == 1
    assert data["isVolumetricSeries"] is False
    assert data["reconstructionReadiness"] == "single_slice_preview_only"
    assert "3D cortical reconstruction requires" in data["reconstructionMessage"]
    assert data["rows"] == 64
    assert data["columns"] == 64
    assert data["sliceThicknessMm"] == 1.0
    assert data["reconstructionKernel"] == "BONE"
    assert data["primaryPreviewUrl"].startswith("data:image/png;base64,")


def test_upload_non_ct_modality_is_rejected(auth_headers):
    dcm_bytes = create_synthetic_dicom_bytes(modality="MR")
    files = [("files", ("mr-series.dcm", dcm_bytes, "application/dicom"))]

    res = client.post("/api/imaging/upload", files=files, headers=auth_headers)

    assert res.status_code == 400
    assert "Only axial CT acquisition series are supported" in res.json()["detail"]


def test_upload_dicom_to_existing_case(auth_headers):
    # 1. Create a case
    create_res = client.post(
        "/api/cases",
        json={
            "name": "DICOM Upload Subject",
            "demographics": {
                "researchSubjectId": "SUBJ-DICOM-01",
                "affectedSide": "right",
            },
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 201
    case_id = create_res.json()["id"]

    # 2. Upload DICOM to the case
    dcm_bytes = create_synthetic_dicom_bytes(rows=128, cols=128, thickness=0.8)
    files = [("files", ("VHFCT1mm-Shoulder (1) (1).dcm", dcm_bytes, "application/dicom"))]

    upload_res = client.post(f"/api/cases/{case_id}/imaging/upload", files=files, headers=auth_headers)
    assert upload_res.status_code == 200
    data = upload_res.json()
    assert data["success"] is True
    assert data["caseId"] == case_id
    assert data["sliceCount"] == 1

    # 3. Retrieve the case and verify imaging metadata was persisted to SQLite
    get_res = client.get(f"/api/cases/{case_id}", headers=auth_headers)
    assert get_res.status_code == 200
    case_data = get_res.json()

    assert case_data["imaging"] is not None
    assert case_data["imaging"]["rows"] == 128
    assert case_data["imaging"]["columns"] == 128
    assert case_data["imaging"]["sliceThicknessMm"] == 0.8
    assert case_data["imaging"]["primaryPreviewUrl"].startswith("data:image/png;base64,")
    assert case_data["status"] == "imaging_imported"


def test_upload_dicom_to_nonexistent_case(auth_headers):
    dcm_bytes = create_synthetic_dicom_bytes()
    files = [("files", ("slice.dcm", dcm_bytes, "application/dicom"))]
    res = client.post("/api/cases/SHL-9999-NOTFOUND/imaging/upload", files=files, headers=auth_headers)
    assert res.status_code == 404
    assert "was not found in storage" in res.json()["detail"]


def test_upload_dicom_trailing_slash_support(auth_headers):
    """Verify that both with and without trailing slash are registered in FastAPI."""
    dcm_bytes = create_synthetic_dicom_bytes(rows=32, cols=32)
    files = [("files", ("test_slice.dcm", dcm_bytes, "application/dicom"))]
    res = client.post("/api/imaging/upload/", files=files, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["success"] is True



def test_unregistered_endpoint_returns_generic_not_found():
    """
    REGRESSION CONFIRMATION:
    FastAPI returns {'detail': 'Not Found'} when a route is not registered on the router.
    This verifies that Render's {"detail": "Not Found"} was caused by the route not existing on the older Render build.
    """
    res = client.post("/api/unregistered_imaging_endpoint")
    assert res.status_code == 404
    assert res.json() == {"detail": "Not Found"}


def test_multi_slice_physical_sorting(auth_headers):
    """Verify that multiple uploaded slices are physically ordered along the scan normal axis."""
    s1 = create_synthetic_dicom_bytes(instance_number=3, image_position_patient=[0.0, 0.0, 30.0])
    s2 = create_synthetic_dicom_bytes(instance_number=1, image_position_patient=[0.0, 0.0, 10.0])
    s3 = create_synthetic_dicom_bytes(instance_number=2, image_position_patient=[0.0, 0.0, 20.0])

    # Upload shuffled
    files = [
        ("files", ("slice_3.dcm", s1, "application/dicom")),
        ("files", ("slice_1.dcm", s2, "application/dicom")),
        ("files", ("slice_2.dcm", s3, "application/dicom")),
    ]
    res = client.post("/api/imaging/upload", files=files, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["sliceCount"] == 3
    assert data["sliceSpacingMm"] == 10.0
    assert data["zCoverageMm"] == 21.0  # (30.0 - 10.0) + 1.0 thickness
    # Verify sorted order in slice list
    assert [s["instanceNumber"] for s in data["slices"]] == [1, 2, 3]
    assert [s["physicalPositionMm"] for s in data["slices"]] == [10.0, 20.0, 30.0]


def test_multi_slice_deduplication(auth_headers):
    """Verify duplicate slices (identical SOPInstanceUID) are detected and accounted for."""
    dup_sop = "1.2.826.0.1.3680043.8.498.999.1"
    s1 = create_synthetic_dicom_bytes(sop_uid=dup_sop, instance_number=1, slice_location=10.0)
    s2 = create_synthetic_dicom_bytes(sop_uid=dup_sop, instance_number=1, slice_location=10.0)

    files = [
        ("files", ("slice_a.dcm", s1, "application/dicom")),
        ("files", ("slice_b.dcm", s2, "application/dicom")),
    ]
    res = client.post("/api/imaging/upload", files=files, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["sliceCount"] == 1
    assert data["duplicateCount"] == 1


def test_multi_slice_mismatched_series_rejected(auth_headers):
    """Verify slices with different SeriesInstanceUIDs are safely rejected with clear diagnostic message."""
    s1 = create_synthetic_dicom_bytes(series_uid="1.2.826.0.1.3680043.8.498.10.1", instance_number=1)
    s2 = create_synthetic_dicom_bytes(series_uid="1.2.826.0.1.3680043.8.498.20.1", instance_number=2)

    files = [
        ("files", ("scan_a.dcm", s1, "application/dicom")),
        ("files", ("scan_b.dcm", s2, "application/dicom")),
    ]
    res = client.post("/api/imaging/upload", files=files, headers=auth_headers)
    assert res.status_code == 400
    assert "distinct SeriesInstanceUIDs" in res.json()["detail"]


def test_multi_slice_gap_detection(auth_headers):
    """Verify that gaps between contiguous slices are flagged."""
    # Test partial series with gap
    s1 = create_synthetic_dicom_bytes(instance_number=1, slice_location=0.0)
    s2 = create_synthetic_dicom_bytes(instance_number=2, slice_location=1.0)
    s3 = create_synthetic_dicom_bytes(instance_number=3, slice_location=12.0)  # Gap of 11mm vs 1mm step

    files = [
        ("files", ("s1.dcm", s1, "application/dicom")),
        ("files", ("s2.dcm", s2, "application/dicom")),
        ("files", ("s3.dcm", s3, "application/dicom")),
    ]
    res = client.post("/api/imaging/upload", files=files, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["hasGaps"] is True
    assert len(data["gapWarnings"]) > 0
    assert "Gap of 11.00 mm detected" in data["gapWarnings"][0]
    assert data["reconstructionReadiness"] == "partial_series_insufficient"

    # Test full 30-slice series with gap -> volumetric_with_gaps
    vol_files = []
    for i in range(30):
        loc = float(i) if i < 15 else float(i + 10)  # 11mm jump at slice 15
        b = create_synthetic_dicom_bytes(rows=16, cols=16, instance_number=i + 1, slice_location=loc)
        vol_files.append(("files", (f"gap_slice_{i:02d}.dcm", b, "application/dicom")))

    res_vol = client.post("/api/imaging/upload", files=vol_files, headers=auth_headers)
    assert res_vol.status_code == 200
    vol_data = res_vol.json()
    assert vol_data["hasGaps"] is True
    assert vol_data["reconstructionReadiness"] == "volumetric_with_gaps"


def test_volumetric_readiness_30_contiguous_slices(auth_headers):
    """Verify that a full volume of >= 30 contiguous slices triggers volumetric_reconstruction_ready."""
    files = []
    for i in range(30):
        # 30 slices, 1 mm apart
        b = create_synthetic_dicom_bytes(
            rows=32,
            cols=32,
            thickness=1.0,
            instance_number=i + 1,
            slice_location=float(i),
        )
        files.append(("files", (f"slice_{i:03d}.dcm", b, "application/dicom")))

    res = client.post("/api/imaging/upload", files=files, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["sliceCount"] == 30
    assert data["isVolumetricSeries"] is True
    assert data["reconstructionReadiness"] == "volumetric_reconstruction_ready"
    assert "Valid volumetric CT series" in data["reconstructionMessage"]

    assert data["zCoverageMm"] == 30.0  # 29 mm span + 1 mm thickness
    assert data["volumeDimensionsMm"] is not None


def test_patient_ct_segmentation_and_reconstruction_persist(auth_headers):
    create_res = client.post(
        "/api/cases",
        json={
            "name": "CT Reconstruction Subject",
            "demographics": {"researchSubjectId": "SUBJ-RECON-01", "affectedSide": "right"},
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 201
    case_id = create_res.json()["id"]
    files = [
        ("files", (f"slice_{index}.dcm", create_synthetic_dicom_bytes(
            rows=16, cols=16, instance_number=index + 1, slice_location=float(index)
        ), "application/dicom"))
        for index in range(4)
    ]
    upload = client.post(f"/api/cases/{case_id}/imaging/upload", files=files, headers=auth_headers)
    assert upload.status_code == 200
    assert len(upload.json()["sourceFiles"]) == 4

    segmentation = client.post(
        f"/api/cases/{case_id}/imaging/segmentation?thresholdHu=300",
        headers=auth_headers,
    )
    assert segmentation.status_code == 200
    assert segmentation.json()["status"] == "completed"
    assert segmentation.json()["voxelCount"] > 0

    reconstruction = client.post(
        f"/api/cases/{case_id}/imaging/reconstruct?thresholdHu=300",
        headers=auth_headers,
    )
    assert reconstruction.status_code == 200
    model = reconstruction.json()["mesh"]
    assert model["isDemoMesh"] is False
    assert model["provenance"].startswith("Patient CT")
    assert model["triangleCount"] > 0

    reopened = client.get(f"/api/cases/{case_id}", headers=auth_headers)
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "models_generated"
    assert reopened.json()["meshes"][0]["id"] == model["id"]


def test_patient_ct_reconstruction_reports_empty_segmentation(auth_headers):
    create_res = client.post(
        "/api/cases",
        json={
            "name": "Empty Segmentation Subject",
            "demographics": {"researchSubjectId": "SUBJ-RECON-EMPTY", "affectedSide": "left"},
        },
        headers=auth_headers,
    )
    case_id = create_res.json()["id"]
    files = [
        ("files", (f"slice_{index}.dcm", create_synthetic_dicom_bytes(
            rows=16, cols=16, instance_number=index + 1, slice_location=float(index)
        ), "application/dicom"))
        for index in range(3)
    ]
    upload = client.post(f"/api/cases/{case_id}/imaging/upload", files=files, headers=auth_headers)
    assert upload.status_code == 200
    segmentation = client.post(
        f"/api/cases/{case_id}/imaging/segmentation?thresholdHu=3000",
        headers=auth_headers,
    )
    assert segmentation.status_code == 422
    assert "Segmentation is empty" in segmentation.json()["detail"]


def test_segmentation_preview_correction_and_mask_reconstruction(auth_headers):
    create_res = client.post(
        "/api/cases",
        json={
            "name": "CT Correction Subject",
            "demographics": {"researchSubjectId": "SUBJ-CORRECT-01", "affectedSide": "right"},
        },
        headers=auth_headers,
    )
    case_id = create_res.json()["id"]
    files = [
        ("files", (f"slice_{index}.dcm", create_synthetic_dicom_bytes(
            rows=16, cols=16, instance_number=index + 1, slice_location=float(index)
        ), "application/dicom"))
        for index in range(4)
    ]
    assert client.post(f"/api/cases/{case_id}/imaging/upload", files=files, headers=auth_headers).status_code == 200
    segmented = client.post(f"/api/cases/{case_id}/imaging/segmentation?thresholdHu=300", headers=auth_headers)
    assert segmented.status_code == 200
    original_version = segmented.json()["version"]

    preview = client.get(
        f"/api/cases/{case_id}/imaging/segmentation/preview?orientation=coronal&sliceIndex=3",
        headers=auth_headers,
    )
    assert preview.status_code == 200
    assert preview.json()["ctPreviewUrl"].startswith("data:image/png;base64,")
    assert preview.json()["maskPreviewUrl"].startswith("data:image/png;base64,")
    assert preview.json()["spacingMm"] == [1.0, 0.75, 0.75]

    correction = client.post(
        f"/api/cases/{case_id}/imaging/segmentation/corrections",
        json={
            "sliceIndex": 0,
            "operations": [{"x": 0, "y": 0, "radius": 1, "add": True}],
        },
        headers=auth_headers,
    )
    assert correction.status_code == 200
    assert correction.json()["version"] == original_version + 1
    assert correction.json()["reconstructionStatus"] == "outdated"
    assert correction.json()["manualCorrections"]

    rebuilt = client.post(f"/api/cases/{case_id}/imaging/reconstruct", headers=auth_headers)
    assert rebuilt.status_code == 200
    assert rebuilt.json()["mesh"]["surfaceAreaMm2"] > 0


def test_segmentation_rejects_invalid_threshold_range(auth_headers):
    create_res = client.post(
        "/api/cases",
        json={
            "name": "Invalid Threshold Subject",
            "demographics": {"researchSubjectId": "SUBJ-THRESHOLD-01", "affectedSide": "left"},
        },
        headers=auth_headers,
    )
    case_id = create_res.json()["id"]
    files = [
        ("files", (f"slice_{index}.dcm", create_synthetic_dicom_bytes(
            rows=16, cols=16, instance_number=index + 1, slice_location=float(index)
        ), "application/dicom"))
        for index in range(2)
    ]
    assert client.post(f"/api/cases/{case_id}/imaging/upload", files=files, headers=auth_headers).status_code == 200
    response = client.post(
        f"/api/cases/{case_id}/imaging/segmentation?thresholdHu=500&maxThresholdHu=300",
        headers=auth_headers,
    )
    assert response.status_code == 422
    assert "lower than maximum" in response.json()["detail"]


def test_glenoid_region_is_derived_from_patient_space_masks():
    from backend.app.services.dicom_service import derive_glenoid_region

    scapula = np.zeros((8, 20, 8), dtype=bool)
    humerus = np.zeros_like(scapula)
    scapula[2:6, 2:18, 2:6] = True
    humerus[2:6, 18:20, 2:6] = True
    region, metadata = derive_glenoid_region(
        scapula,
        humerus,
        {
            "spacingMm": [1.0, 1.0, 1.0],
            "orientation": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            "originMm": [0.0, 0.0, 0.0],
        },
    )

    assert region is not None
    assert region.dtype == bool
    assert 0 < int(region.sum()) < int(scapula.sum())
    assert np.all(region <= scapula)
    assert metadata["status"] == "manual_review_required"
    assert "patient-space geometry" in metadata["notes"]


def test_separate_shoulder_bones_disconnected_and_touching():
    import numpy as np
    import pytest
    from backend.app.services.dicom_service import separate_shoulder_bones, DicomValidationError

    analysis = {
        "rowDirection": [1.0, 0.0, 0.0],
        "columnDirection": [0.0, 1.0, 0.0],
        "normalDirection": [0.0, 0.0, 1.0],
        "spacingMm": [1.0, 1.0, 1.0],
    }

    # 1. Disconnected components: anterior (-Y) humerus and posterior (+Y) scapula
    mask_disconnected = np.zeros((16, 32, 16), dtype=bool)
    mask_disconnected[4:12, 2:10, 4:12] = True   # Anterior -> humerus
    mask_disconnected[4:12, 20:28, 4:12] = True  # Posterior -> scapula
    res_disc, method_disc, meta_disc = separate_shoulder_bones(mask_disconnected, analysis, ["scapula", "humerus"])
    assert method_disc == "connected_components"
    assert meta_disc["separationStatus"] == "verified"
    assert meta_disc["separationConfidence"] > 0.65
    assert res_disc["scapula"].sum() == 8 * 8 * 8
    assert res_disc["humerus"].sum() == 8 * 8 * 8
    assert np.array_equal(res_disc["scapula"] | res_disc["humerus"], mask_disconnected)
    assert not np.any(res_disc["scapula"] & res_disc["humerus"])

    # 2. Touching/overlapping single component: two spheres connected by a narrow bridge
    zz, yy, xx = np.ogrid[:24, :48, :24]
    humerus_sphere = (zz - 12) ** 2 + (yy - 12) ** 2 + (xx - 12) ** 2 <= 7 ** 2
    scapula_sphere = (zz - 12) ** 2 + (yy - 34) ** 2 + (xx - 12) ** 2 <= 7 ** 2
    bridge = (np.abs(zz - 12) <= 1) & (yy >= 18) & (yy <= 28) & (np.abs(xx - 12) <= 1)
    mask_touching = humerus_sphere | scapula_sphere | bridge
    res_touch, method_touch, meta_touch = separate_shoulder_bones(mask_touching, analysis, ["scapula", "humerus"])
    assert method_touch == "watershed_distance_transform"
    assert meta_touch["separationStatus"] == "verified"
    assert res_touch["scapula"].sum() > 0
    assert res_touch["humerus"].sum() > 0
    assert not np.any(res_touch["scapula"] & res_touch["humerus"])

    # 3. Unusual orientation / ambiguous AP separation (< 5 mm) -> manual_review_required
    mask_ambiguous = np.zeros((16, 16, 32), dtype=bool)
    mask_ambiguous[4:12, 6:10, 2:10] = True
    mask_ambiguous[4:12, 7:11, 20:28] = True
    _, _, meta_ambig = separate_shoulder_bones(mask_ambiguous, analysis, ["scapula", "humerus"])
    assert meta_ambig["separationStatus"] == "manual_review_required"

    # 4. Empty mask -> raises DicomValidationError
    empty_mask = np.zeros((8, 8, 8), dtype=bool)
    with pytest.raises(DicomValidationError):
        separate_shoulder_bones(empty_mask, analysis, ["scapula", "humerus"])
