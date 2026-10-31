import * as THREE from 'three';
import { ImplantReferencePoint } from '../../types/case';

export class ReferencePointMarkersManager {
  private readonly group = new THREE.Group();

  public getGroup(): THREE.Group {
    return this.group;
  }

  public update(points: ImplantReferencePoint[], transform: { translation: [number, number, number]; rotationDeg: [number, number, number] }, selectedId?: string | null): void {
    this.group.clear();
    const rotation = new THREE.Euler(
      THREE.MathUtils.degToRad(transform.rotationDeg[0]),
      THREE.MathUtils.degToRad(transform.rotationDeg[1]),
      THREE.MathUtils.degToRad(transform.rotationDeg[2]),
    );
    const position = new THREE.Vector3(...transform.translation);
    points.forEach((point) => {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(2.4, 16, 16),
        new THREE.MeshStandardMaterial({
          color: point.id === selectedId ? '#facc15' : '#a855f7',
          emissive: point.id === selectedId ? '#a16207' : '#6b21a8',
          emissiveIntensity: 0.45,
        }),
      );
      marker.position.set(...point.coordinatesLocal).applyEuler(rotation).add(position);
      marker.userData.referencePoint = point;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 96;
      const context = canvas.getContext('2d');
      if (context) {
        context.font = 'bold 32px sans-serif';
        context.fillStyle = '#f5d0fe';
        context.fillText(point.name, 8, 58);
      }
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthTest: false,
      }));
      label.scale.set(18, 3.4, 1);
      label.position.y = 5;
      marker.add(label);
      this.group.add(marker);
    });
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
