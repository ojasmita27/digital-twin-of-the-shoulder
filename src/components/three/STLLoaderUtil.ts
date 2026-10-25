/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export interface LoadedMeshResult {
  geometry: THREE.BufferGeometry;
  vertexCount: number;
  faceCount: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    dimensions: [number, number, number];
  };
}

export function parseSTLArrayBuffer(buffer: ArrayBuffer): LoadedMeshResult {
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const vertexCount = geometry.attributes.position ? geometry.attributes.position.count : 0;
  const faceCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;

  const bbox = geometry.boundingBox || new THREE.Box3();
  const size = new THREE.Vector3();
  bbox.getSize(size);

  return {
    geometry,
    vertexCount,
    faceCount: Math.round(faceCount),
    boundingBox: {
      min: [bbox.min.x, bbox.min.y, bbox.min.z],
      max: [bbox.max.x, bbox.max.y, bbox.max.z],
      dimensions: [size.x, size.y, size.z],
    },
  };
}
