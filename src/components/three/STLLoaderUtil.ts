/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export type SupportedModelFormat = 'stl' | 'ply' | 'obj';
export type GeometryCheckStatus = 'pass' | 'warning' | 'fail' | 'not_assessed';

export interface GeometryQualityCheck {
  name: string;
  status: GeometryCheckStatus;
  explanation: string;
  correctiveAction?: string;
}

export interface LoadedMeshResult {
  format: SupportedModelFormat;
  geometry: THREE.BufferGeometry;
  vertexCount: number;
  faceCount: number;
  surfaceArea: number;
  isWatertight: boolean | null;
  degenerateTriangleCount: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  connectedComponentCount: number;
  duplicateTriangleCount: number;
  normalsConsistent: boolean | null;
  qualityChecks: GeometryQualityCheck[];
  validationStatus: 'valid' | 'invalid';
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    dimensions: [number, number, number];
  };
  boundingSphere: {
    center: [number, number, number];
    radius: number;
  };
}

export function parseSTLArrayBuffer(buffer: ArrayBuffer): LoadedMeshResult {
  return parseGeometry(buffer, 'stl');
}

export function parseModelArrayBuffer(buffer: ArrayBuffer, filename: string): LoadedMeshResult {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension !== 'stl' && extension !== 'ply' && extension !== 'obj') {
    throw new Error('Unsupported model format. Select an STL, PLY, or OBJ file.');
  }
  return parseGeometry(buffer, extension);
}

function parseGeometry(buffer: ArrayBuffer, format: SupportedModelFormat): LoadedMeshResult {
  if (buffer.byteLength === 0) {
    throw new Error('The selected model file is empty.');
  }
  const textStart = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 256))).trimStart().toLowerCase();
  if (format === 'stl' && buffer.byteLength < 84 && !textStart.startsWith('solid')) {
    throw new Error('The selected file is too small to contain a valid STL mesh.');
  }

  let geometry: THREE.BufferGeometry;
  if (format === 'stl') {
    geometry = new STLLoader().parse(buffer);
  } else if (format === 'ply') {
    geometry = new PLYLoader().parse(buffer);
  } else {
    const text = new TextDecoder().decode(buffer);
    const group = new OBJLoader().parse(text);
    const geometries: THREE.BufferGeometry[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry.getAttribute('position')) {
        geometries.push(child.geometry.clone().toNonIndexed());
      }
    });
    if (geometries.length === 0) {
      throw new Error('The OBJ file does not contain mesh geometry.');
    }
    const positionArrays = geometries.map((item) => item.getAttribute('position').array);
    const totalValues = positionArrays.reduce((sum, values) => sum + values.length, 0);
    const positions = new Float32Array(totalValues);
    let offset = 0;
    positionArrays.forEach((values) => {
      positions.set(values, offset);
      offset += values.length;
    });
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometries.forEach((item) => item.dispose());
  }
  if (!geometry.getAttribute('position') && format === 'ply') {
    throw new Error('The PLY file does not contain vertex geometry.');
  }
  if (geometry.index) geometry = geometry.toNonIndexed();
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3 || position.count % 3 !== 0) {
    throw new Error('The STL file does not contain a complete triangle mesh.');
  }
  for (let i = 0; i < position.count; i += 1) {
    if (!Number.isFinite(position.getX(i)) || !Number.isFinite(position.getY(i)) || !Number.isFinite(position.getZ(i))) {
      throw new Error('The STL file contains invalid vertex coordinates.');
    }
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const vertexCount = position.count;
  const faceCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;
  let surfaceArea = 0;
  let degenerateTriangleCount = 0;
  let duplicateTriangleCount = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edges = new Map<string, number>();
  const triangleEdges: string[][] = [];
  const triangleKeys = new Set<string>();
  const edgeKey = (first: THREE.Vector3, second: THREE.Vector3) => {
    const left = `${first.x.toPrecision(12)},${first.y.toPrecision(12)},${first.z.toPrecision(12)}`;
    const right = `${second.x.toPrecision(12)},${second.y.toPrecision(12)},${second.z.toPrecision(12)}`;
    return left < right ? `${left}|${right}` : `${right}|${left}`;
  };
  const positionIndex = (triangle: number, corner: number) => (
    geometry.index ? geometry.index.getX(triangle * 3 + corner) : triangle * 3 + corner
  );
  const vertexKey = (vertex: THREE.Vector3) => (
    `${vertex.x.toPrecision(12)},${vertex.y.toPrecision(12)},${vertex.z.toPrecision(12)}`
  );

  for (let index = 0; index < faceCount; index += 1) {
    a.fromBufferAttribute(position, positionIndex(index, 0));
    b.fromBufferAttribute(position, positionIndex(index, 1));
    c.fromBufferAttribute(position, positionIndex(index, 2));
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    surfaceArea += area;
    if (area <= Number.EPSILON * Math.max(sizeMagnitude(a), sizeMagnitude(b), sizeMagnitude(c), 1)) {
      degenerateTriangleCount += 1;
    }
    const vertices = [vertexKey(a), vertexKey(b), vertexKey(c)].sort();
    const triangleKey = vertices.join('|');
    if (triangleKeys.has(triangleKey)) duplicateTriangleCount += 1;
    triangleKeys.add(triangleKey);
    const currentEdges = [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)];
    triangleEdges.push(currentEdges);
    currentEdges.forEach((key) => {
      edges.set(key, (edges.get(key) || 0) + 1);
    });
  }

  const bbox = geometry.boundingBox || new THREE.Box3();
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const sphere = geometry.boundingSphere || new THREE.Sphere();
  const boundaryEdgeCount = Array.from(edges.values()).filter((count) => count === 1).length;
  const nonManifoldEdgeCount = Array.from(edges.values()).filter((count) => count > 2).length;
  const connectedComponentCount = countConnectedComponents(triangleEdges);
  const normalsConsistent = null;
  const isWatertight = edges.size > 0 && boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0;
  const qualityChecks: GeometryQualityCheck[] = [
    {
      name: 'Triangle validity',
      status: degenerateTriangleCount > 0 ? 'fail' : 'pass',
      explanation: degenerateTriangleCount > 0
        ? `${degenerateTriangleCount} degenerate triangle(s) were detected.`
        : 'All parsed triangles have non-zero area.',
      correctiveAction: degenerateTriangleCount > 0 ? 'Repair or remove degenerate faces before measurement.' : undefined,
    },
    {
      name: 'Connectivity',
      status: connectedComponentCount > 1 ? 'warning' : 'pass',
      explanation: `${connectedComponentCount} connected surface component(s) detected.`,
      correctiveAction: connectedComponentCount > 1 ? 'Confirm that separate components are intentional and anatomically labelled.' : undefined,
    },
    {
      name: 'Boundary edges',
      status: boundaryEdgeCount > 0 ? 'warning' : 'pass',
      explanation: boundaryEdgeCount > 0
        ? `${boundaryEdgeCount} boundary edge(s) indicate an open surface.`
        : 'No boundary edges detected.',
      correctiveAction: boundaryEdgeCount > 0 ? 'Inspect or repair open surface boundaries for operations requiring a closed mesh.' : undefined,
    },
    {
      name: 'Watertightness',
      status: isWatertight ? 'pass' : 'warning',
      explanation: isWatertight ? 'Every edge is shared by exactly two triangles.' : 'The mesh is not watertight or cannot be treated as a closed surface.',
    },
    {
      name: 'Surface normals',
      status: 'not_assessed',
      explanation: 'Reliable winding consistency is not established by this client-side check.',
      correctiveAction: 'Review normals in a mesh editor before clinical or volumetric use.',
    },
    {
      name: 'Physical scale',
      status: 'warning',
      explanation: 'Model units are not encoded reliably in the uploaded format.',
      correctiveAction: 'Confirm the model unit before reporting physical measurements.',
    },
  ];

  return {
    format,
    geometry,
    vertexCount,
    faceCount: Math.round(faceCount),
    surfaceArea,
    isWatertight,
    degenerateTriangleCount,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    connectedComponentCount,
    duplicateTriangleCount,
    normalsConsistent,
    qualityChecks,
    validationStatus: degenerateTriangleCount > 0 ? 'invalid' : 'valid',
    boundingBox: {
      min: [bbox.min.x, bbox.min.y, bbox.min.z],
      max: [bbox.max.x, bbox.max.y, bbox.max.z],
      dimensions: [size.x, size.y, size.z],
    },
    boundingSphere: {
      center: [sphere.center.x, sphere.center.y, sphere.center.z],
      radius: sphere.radius,
    },
  };
}

function sizeMagnitude(vector: THREE.Vector3): number {
  return Math.max(Math.abs(vector.x), Math.abs(vector.y), Math.abs(vector.z));
}

function countConnectedComponents(triangleEdges: string[][]): number {
  if (triangleEdges.length === 0) return 0;
  const edgeOwners = new Map<string, number[]>();
  triangleEdges.forEach((edges, triangleIndex) => {
    edges.forEach((edge) => {
      const owners = edgeOwners.get(edge) || [];
      owners.push(triangleIndex);
      edgeOwners.set(edge, owners);
    });
  });
  const parent = triangleEdges.map((_, index) => index);
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  const union = (first: number, second: number) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };
  edgeOwners.forEach((owners) => {
    for (let index = 1; index < owners.length; index += 1) union(owners[0], owners[index]);
  });
  return new Set(parent.map((_, index) => find(index))).size;
}
