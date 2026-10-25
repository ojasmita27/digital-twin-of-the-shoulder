/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { AnatomicalLandmark } from '../../types/case';

export class LandmarkMarkersManager {
  private group: THREE.Group;
  private markerMeshes: Map<string, THREE.Mesh> = new Map();
  private sphereGeo: THREE.SphereGeometry;
  private material: THREE.MeshStandardMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'LandmarkMarkersGroup';
    this.sphereGeo = new THREE.SphereGeometry(2.2, 16, 16);
    this.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#06b6d4'), // Laser cyan
      emissive: new THREE.Color('#0891b2'),
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.2,
    });
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public updateLandmarks(landmarks: AnatomicalLandmark[]) {
    // Clear existing
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }
    this.markerMeshes.clear();

    landmarks.forEach((lm) => {
      const mesh = new THREE.Mesh(this.sphereGeo, this.material);
      mesh.position.set(lm.coordinatesMm[0], lm.coordinatesMm[1], lm.coordinatesMm[2]);
      mesh.userData = { landmark: lm };
      mesh.castShadow = true;

      // Add a subtle stem pointing to landmark position
      const stemGeo = new THREE.CylinderGeometry(0.3, 0.3, 6, 8);
      const stemMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#0891b2') });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(0, 3, 0);
      mesh.add(stem);

      this.group.add(mesh);
      this.markerMeshes.set(lm.id, mesh);
    });
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
  }
}
