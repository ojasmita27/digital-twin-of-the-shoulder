import math
from typing import Dict, List

import numpy as np


class RegistrationError(ValueError):
    """Raised when landmark correspondences cannot define a rigid transform."""


def _points(values: List[List[float]], name: str) -> np.ndarray:
    points = np.asarray(values, dtype=float)
    if points.ndim != 2 or points.shape[1] != 3 or points.shape[0] < 3:
        raise RegistrationError(f"{name} must contain at least three 3D points.")
    if not np.isfinite(points).all():
        raise RegistrationError(f"{name} must contain only finite coordinates.")
    if np.linalg.matrix_rank(points - points.mean(axis=0)) < 2:
        raise RegistrationError(f"{name} must contain non-collinear points.")
    return points


def calculate_rigid_registration(source: List[List[float]], target: List[List[float]]) -> Dict[str, object]:
    source_points = _points(source, "source")
    target_points = _points(target, "target")
    if source_points.shape != target_points.shape:
        raise RegistrationError("Source and target must contain the same number of points.")

    source_center = source_points.mean(axis=0)
    target_center = target_points.mean(axis=0)
    covariance = (source_points - source_center).T @ (target_points - target_center)
    u, _, vh = np.linalg.svd(covariance)
    rotation = vh.T @ u.T
    if np.linalg.det(rotation) < 0:
        vh[-1, :] *= -1
        rotation = vh.T @ u.T
    translation = target_center - rotation @ source_center
    transformed = (rotation @ source_points.T).T + translation
    residuals = np.linalg.norm(transformed - target_points, axis=1)
    if not np.isfinite(residuals).all() or not math.isfinite(float(np.linalg.det(rotation))):
        raise RegistrationError("The rigid registration result is not finite.")
    return {
        "rotation": rotation.tolist(),
        "translation": translation.tolist(),
        "residualsMm": residuals.tolist(),
        "meanErrorMm": float(residuals.mean()),
        "maximumErrorMm": float(residuals.max()),
        "rmseMm": float(np.sqrt(np.mean(residuals ** 2))),
        "correspondenceCount": int(source_points.shape[0]),
        "transformType": "rigid",
    }


def apply_rigid_transform(point: List[float], registration: Dict[str, object]) -> List[float]:
    values = np.asarray(point, dtype=float)
    rotation = np.asarray(registration.get("rotation"), dtype=float)
    translation = np.asarray(registration.get("translation"), dtype=float)
    if values.shape != (3,) or rotation.shape != (3, 3) or translation.shape != (3,):
        raise RegistrationError("Invalid rigid transform shape.")
    if not np.isfinite(values).all() or not np.isfinite(rotation).all() or not np.isfinite(translation).all():
        raise RegistrationError("Rigid transform values must be finite.")
    return (rotation @ values + translation).tolist()
