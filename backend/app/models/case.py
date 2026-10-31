from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CaseStatus(str, Enum):
    created = "created"
    imaging_imported = "imaging_imported"
    imaging_validated = "imaging_validated"
    segmentation_queued = "segmentation_queued"
    segmentation_completed = "segmentation_completed"
    models_generated = "models_generated"
    measurements_computed = "measurements_computed"
    planning_in_progress = "planning_in_progress"
    report_finalized = "report_finalized"


class AnatomicalSide(str, Enum):
    left = "left"
    right = "right"


class PatientDemographics(BaseModel):
    researchSubjectId: str = Field(..., description="De-identified research subject code")
    ageBand: str = Field(default="61-75", description="e.g. 18-40, 41-60, 61-75, 75+")
    biologicalSex: str = Field(default="undisclosed", description="female, male, or undisclosed")
    indication: str = Field(default="Primary Osteoarthritis", description="Clinical research indication")
    affectedSide: AnatomicalSide = Field(default=AnatomicalSide.right)


class CaseCreateRequest(BaseModel):
    name: str = Field(..., description="Descriptive case label")
    demographics: PatientDemographics
    isDemo: Optional[bool] = False


class ResearchCase(BaseModel):
    id: str
    name: str
    createdAt: str
    updatedAt: str
    isDemo: bool = False
    status: CaseStatus = CaseStatus.created
    demographics: PatientDemographics
    imaging: Optional[Dict[str, Any]] = None
    segmentationJob: Optional[Dict[str, Any]] = None
    meshes: List[Dict[str, Any]] = Field(default_factory=list)
    landmarks: List[Dict[str, Any]] = Field(default_factory=list)
    measurements: Optional[Dict[str, Any]] = None
    implantPlan: Optional[Dict[str, Any]] = None
    reports: List[Dict[str, Any]] = Field(default_factory=list)
    createdByUserId: Optional[str] = None



class BackendHealthResponse(BaseModel):
    status: str = "healthy"
    service: str
    version: str
    timestamp: str
    gpuAvailable: bool = False
    cudaDevice: Optional[str] = None
    torchVersion: Optional[str] = None
    monaiVersion: Optional[str] = None
    simpleItkVersion: Optional[str] = None
    activeJobsCount: int = 0
