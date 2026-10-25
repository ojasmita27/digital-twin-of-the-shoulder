from datetime import datetime, timezone
from fastapi import APIRouter
from ..models.case import BackendHealthResponse
from ..config import settings
from ..storage.memory import case_store

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=BackendHealthResponse)
def get_health() -> BackendHealthResponse:
    """
    Truthful service health and environment status endpoint.
    Checks actual availability of CUDA, PyTorch, SimpleITK, and MONAI without fabricating capabilities.
    """
    gpu_available = False
    cuda_device = None
    torch_version = None
    monai_version = None
    simpleitk_version = None

    # Check torch if available
    try:
        import torch  # type: ignore
        torch_version = torch.__version__
        gpu_available = torch.cuda.is_available()
        if gpu_available:
            cuda_device = torch.cuda.get_device_name(0)
    except ImportError:
        pass

    # Check monai if available
    try:
        import monai  # type: ignore
        monai_version = monai.__version__
    except ImportError:
        pass

    # Check SimpleITK if available
    try:
        import SimpleITK as sitk  # type: ignore
        simpleitk_version = sitk.__version__
    except ImportError:
        pass

    return BackendHealthResponse(
        status="healthy",
        service=settings.SERVICE_NAME,
        version=settings.VERSION,
        timestamp=datetime.now(timezone.utc).isoformat(),
        gpuAvailable=gpu_available,
        cudaDevice=cuda_device,
        torchVersion=torch_version,
        monaiVersion=monai_version,
        simpleItkVersion=simpleitk_version,
        activeJobsCount=0,
    )
