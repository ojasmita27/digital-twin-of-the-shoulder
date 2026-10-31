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


