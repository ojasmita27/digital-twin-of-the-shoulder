from backend.app.services.mesh_quality import analyze_mesh


def test_mesh_quality_detects_open_degenerate_and_duplicate_geometry():
    obj = b"\n".join(
        [
            b"v 0 0 0",
            b"v 1 0 0",
            b"v 0 1 0",
            b"v 0 0 0",
            b"f 1 2 3",
            b"f 1 1 2",
        ]
    )
    result = analyze_mesh(obj, "obj")
    assert result["vertexCount"] == 4
    assert result["triangleCount"] == 2
    assert result["duplicateVertexCount"] == 1
    assert result["degenerateTriangleCount"] == 1
    assert result["boundaryEdgeCount"] == 3
    assert result["connectedComponentCount"] == 1
    assert result["watertight"] is False


def test_ascii_ply_quality_reports_closed_tetrahedron():
    ply = b"""ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
element face 4
property list uchar int vertex_indices
end_header
0 0 0
1 0 0
0 1 0
0 0 1
3 0 2 1
3 0 1 3
3 0 3 2
3 1 2 3
"""
    result = analyze_mesh(ply, "ply")
    assert result["triangleCount"] == 4
    assert result["boundaryEdgeCount"] == 0
    assert result["nonManifoldEdgeCount"] == 0
    assert result["watertight"] is True
