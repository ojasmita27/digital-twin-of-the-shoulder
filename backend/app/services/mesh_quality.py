"""Deterministic mesh parsing and quality analysis for research geometry."""

from __future__ import annotations

import math
import struct
from collections import defaultdict, deque
from typing import Dict, Iterable, List, Sequence, Tuple


Point = Tuple[float, float, float]
Triangle = Tuple[int, int, int]


class MeshParseError(ValueError):
    """Raised when a supported mesh cannot be parsed safely."""


def _finite_point(values: Sequence[float]) -> Point:
    if len(values) != 3 or not all(math.isfinite(float(value)) for value in values):
        raise MeshParseError("Mesh contains a non-finite or invalid vertex.")
    return (float(values[0]), float(values[1]), float(values[2]))


def _triangulate(indices: Sequence[int]) -> Iterable[Triangle]:
    if len(indices) < 3:
        return
    for index in range(1, len(indices) - 1):
        yield (int(indices[0]), int(indices[index]), int(indices[index + 1]))


def _parse_stl(content: bytes) -> Tuple[List[Point], List[Triangle]]:
    if len(content) >= 84:
        count = struct.unpack_from("<I", content, 80)[0]
        if count <= (len(content) - 84) // 50 and 84 + count * 50 == len(content):
            vertices: List[Point] = []
            faces: List[Triangle] = []
            for offset in range(84, len(content), 50):
                points = [
                    _finite_point(struct.unpack_from("<3f", content, offset + point_offset))
                    for point_offset in (12, 24, 36)
                ]
                start = len(vertices)
                vertices.extend(points)
                faces.append((start, start + 1, start + 2))
            return vertices, faces
    try:
        lines = content.decode("utf-8").splitlines()
    except UnicodeDecodeError as error:
        raise MeshParseError("STL is neither valid binary nor UTF-8 ASCII.") from error
    vertices = []
    faces = []
    current: List[int] = []
    for line in lines:
        values = line.strip().split()
        if len(values) == 4 and values[0].lower() == "vertex":
            vertices.append(_finite_point([float(value) for value in values[1:]]))
            current.append(len(vertices) - 1)
            if len(current) == 3:
                faces.append(tuple(current))
                current = []
    if not faces:
        raise MeshParseError("STL contains no triangular faces.")
    return vertices, faces


def _parse_obj(content: bytes) -> Tuple[List[Point], List[Triangle]]:
    try:
        lines = content.decode("utf-8").splitlines()
    except UnicodeDecodeError as error:
        raise MeshParseError("OBJ must be UTF-8 text.") from error
    vertices: List[Point] = []
    faces: List[Triangle] = []
    for line in lines:
        values = line.strip().split()
        if not values or values[0].startswith("#"):
            continue
        if values[0] == "v" and len(values) >= 4:
            vertices.append(_finite_point([float(value) for value in values[1:4]]))
        elif values[0] == "f" and len(values) >= 4:
            indices: List[int] = []
            for token in values[1:]:
                raw_index = int(token.split("/")[0])
                index = raw_index - 1 if raw_index > 0 else len(vertices) + raw_index
                if index < 0 or index >= len(vertices):
                    raise MeshParseError("OBJ face references a vertex outside the vertex list.")
                indices.append(index)
            faces.extend(_triangulate(indices))
    if not vertices or not faces:
        raise MeshParseError("OBJ contains no readable vertices and triangular faces.")
    return vertices, faces


def _parse_ply(content: bytes) -> Tuple[List[Point], List[Triangle]]:
    marker = content.find(b"end_header")
    if marker < 0:
        raise MeshParseError("PLY header is missing end_header.")
    header_end = marker + len(b"end_header")
    newline = content.find(b"\n", header_end)
    if newline < 0:
        raise MeshParseError("PLY header is incomplete.")
    header = content[:newline + 1].decode("ascii", errors="strict").splitlines()
    fmt = next((line.split()[1] for line in header if line.startswith("format ")), "")
    vertex_count = 0
    face_count = 0
    current_element = ""
    for line in header:
        values = line.split()
        if len(values) >= 3 and values[0] == "element":
            current_element = values[1]
            if current_element == "vertex":
                vertex_count = int(values[2])
            elif current_element == "face":
                face_count = int(values[2])
    if fmt != "ascii":
        raise MeshParseError("Only ASCII PLY is supported for server-side validation.")
    lines = content[newline + 1:].decode("ascii", errors="strict").splitlines()
    vertices = [_finite_point([float(value) for value in lines[index].split()[:3]]) for index in range(vertex_count)]
    faces: List[Triangle] = []
    for line in lines[vertex_count:vertex_count + face_count]:
        values = line.split()
        if not values:
            continue
        count = int(values[0])
        indices = [int(value) for value in values[1:count + 1]]
        if any(index < 0 or index >= len(vertices) for index in indices):
            raise MeshParseError("PLY face references a vertex outside the vertex list.")
        faces.extend(_triangulate(indices))
    if not vertices or not faces:
        raise MeshParseError("PLY contains no readable vertices and faces.")
    return vertices, faces


def parse_mesh(content: bytes, extension: str) -> Tuple[List[Point], List[Triangle]]:
    extension = extension.lower().lstrip(".")
    if extension == "stl":
        return _parse_stl(content)
    if extension == "obj":
        return _parse_obj(content)
    if extension == "ply":
        return _parse_ply(content)
    raise MeshParseError(f"Unsupported mesh format: {extension}.")


def _cross(a: Point, b: Point) -> Point:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def analyze_mesh(content: bytes, extension: str) -> Dict[str, object]:
    vertices, faces = parse_mesh(content, extension)
    edge_faces: Dict[Tuple[int, int], List[int]] = defaultdict(list)
    adjacency: Dict[int, set[int]] = defaultdict(set)
    degenerate = 0
    area = 0.0
    for face_index, (a, b, c) in enumerate(faces):
        pa, pb, pc = vertices[a], vertices[b], vertices[c]
        cross = _cross((pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]), (pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]))
        triangle_area = 0.5 * math.sqrt(sum(value * value for value in cross))
        area += triangle_area
        if len({a, b, c}) < 3 or triangle_area <= 1e-10:
            degenerate += 1
        for u, v in ((a, b), (b, c), (c, a)):
            edge = (min(u, v), max(u, v))
            edge_faces[edge].append(face_index)
    for refs in edge_faces.values():
        for index, face_index in enumerate(refs):
            adjacency[face_index].update(refs[:index])
            adjacency[face_index].update(refs[index + 1:])
    boundary_edges = sum(1 for refs in edge_faces.values() if len(refs) == 1)
    non_manifold_edges = sum(1 for refs in edge_faces.values() if len(refs) > 2)
    duplicate_vertices = len(vertices) - len(set(vertices))
    visited: set[int] = set()
    components = 0
    for face_index in range(len(faces)):
        if face_index in visited:
            continue
        components += 1
        queue = deque([face_index])
        visited.add(face_index)
        while queue:
            current = queue.popleft()
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
    normals_valid = degenerate == 0
    bounds = {
        "min": [min(point[index] for point in vertices) for index in range(3)],
        "max": [max(point[index] for point in vertices) for index in range(3)],
    }
    return {
        "format": extension,
        "vertexCount": len(vertices),
        "triangleCount": len(faces),
        "faceCount": len(faces),
        "surfaceArea": round(area, 6),
        "boundingBox": bounds,
        "duplicateVertexCount": duplicate_vertices,
        "degenerateTriangleCount": degenerate,
        "boundaryEdgeCount": boundary_edges,
        "nonManifoldEdgeCount": non_manifold_edges,
        "connectedComponentCount": components,
        "surfaceNormalsValid": normals_valid,
        "watertight": boundary_edges == 0 and non_manifold_edges == 0 and degenerate == 0,
        "validationStatus": "valid" if normals_valid and non_manifold_edges == 0 else "warning",
    }
