import math

import pytest

from backend.app.services.registration import RegistrationError, apply_rigid_transform, calculate_rigid_registration


def test_rigid_registration_recovers_rotation_translation():
    source = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]
    target = [[10, -2, 4], [10, -1, 4], [9, -2, 4], [10, -2, 5]]
    result = calculate_rigid_registration(source, target)

    assert result["correspondenceCount"] == 4
    assert result["rmseMm"] == pytest.approx(0)
    assert apply_rigid_transform([0, 0, 0], result) == pytest.approx([10, -2, 4])


def test_registration_rejects_collinear_points():
    with pytest.raises(RegistrationError, match="non-collinear"):
        calculate_rigid_registration(
            [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
            [[1, 1, 1], [2, 1, 1], [3, 1, 1]],
        )


def test_registration_rejects_nonfinite_values():
    with pytest.raises(RegistrationError, match="finite"):
        calculate_rigid_registration(
            [[0, 0, 0], [1, 0, 0], [0, 1, math.inf]],
            [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        )
