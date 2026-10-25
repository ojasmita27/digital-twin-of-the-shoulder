/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export interface ProceduralShoulderModel {
  group: THREE.Group;
  scapulaGroup: THREE.Group;
  humerusGroup: THREE.Group;
  implantGroup: THREE.Group;
  materials: {
    scapula: THREE.MeshStandardMaterial;
    humerus: THREE.MeshStandardMaterial;
    cartilage: THREE.MeshPhysicalMaterial;
    implantMetal: THREE.MeshStandardMaterial;
    implantPoly: THREE.MeshPhysicalMaterial;
  };
}

/**
 * Builds an anatomically proportioned 3D shoulder model composed of
 * Scapula (Glenoid, Body, Spine, Acromion, Coracoid) and Proximal Humerus
 * (Head, Anatomical Neck, Tuberosities, Shaft) with distinct bone density PBR materials.
 */
export function buildProceduralShoulder(): ProceduralShoulderModel {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'ShoulderRoot';

  const scapulaGroup = new THREE.Group();
  scapulaGroup.name = 'ScapulaGroup';

  const humerusGroup = new THREE.Group();
  humerusGroup.name = 'HumerusGroup';

  const implantGroup = new THREE.Group();
  implantGroup.name = 'ImplantGroup';
  implantGroup.visible = false; // toggled in planning mode

  // High-fidelity Bone PBR Materials
  const boneIvoryColor = new THREE.Color('#e8dec9');
  const boneCorticalColor = new THREE.Color('#dfd4be');

  const scapulaMaterial = new THREE.MeshStandardMaterial({
    color: boneIvoryColor,
    roughness: 0.65,
    metalness: 0.05,
    flatShading: false,
    side: THREE.DoubleSide,
  });

  const humerusMaterial = new THREE.MeshStandardMaterial({
    color: boneCorticalColor,
    roughness: 0.62,
    metalness: 0.05,
    flatShading: false,
    side: THREE.DoubleSide,
  });

  const cartilageMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#bde0fe'),
    roughness: 0.25,
    metalness: 0.0,
    transmission: 0.6,
    thickness: 1.2,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });

  const implantMetalMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#94a3b8'),
    roughness: 0.25,
    metalness: 0.9,
  });

  const implantPolyMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f8fafc'),
    roughness: 0.35,
    metalness: 0.02,
    transmission: 0.45,
    thickness: 3.0,
    transparent: true,
    opacity: 0.9,
  });

  // --- 1. SCAPULA ANATOMY ---
  // A. Glenoid Vault & Pear-shaped Fossa
  // The glenoid cavity is an inverted tear-drop / pear shape
  const glenoidProfile = new THREE.Shape();
  glenoidProfile.moveTo(0, 18); // Superior pole
  glenoidProfile.bezierCurveTo(7, 16, 11, 8, 11, 0); // Upper anterior rim
  glenoidProfile.bezierCurveTo(14, -8, 12, -22, 0, -22); // Lower wide rim (inferior pole)
  glenoidProfile.bezierCurveTo(-12, -22, -14, -8, -11, 0); // Lower posterior rim
  glenoidProfile.bezierCurveTo(-11, 8, -7, 16, 0, 18); // Upper posterior rim

  const glenoidExtrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: 14,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 2,
    bevelSize: 2.5,
    bevelThickness: 3.5,
  };

  const glenoidGeo = new THREE.ExtrudeGeometry(glenoidProfile, glenoidExtrudeSettings);
  glenoidGeo.center();
  // Slight concave curvature for articular socket
  const glenoidMesh = new THREE.Mesh(glenoidGeo, scapulaMaterial);
  glenoidMesh.rotation.y = Math.PI / 2; // Glenoid facing laterally (towards +X)
  glenoidMesh.position.set(0, 0, 0);
  glenoidMesh.castShadow = true;
  glenoidMesh.receiveShadow = true;
  scapulaGroup.add(glenoidMesh);

  // Articular Cartilage layer over glenoid face
  const cartilageGeo = new THREE.RingGeometry(2, 12, 32);
  const cartilageMesh = new THREE.Mesh(cartilageGeo, cartilageMaterial);
  cartilageMesh.rotation.y = Math.PI / 2;
  cartilageMesh.position.set(7.5, 0, 0);
  scapulaGroup.add(cartilageMesh);

  // B. Scapular Neck & Subscapular Fossa (Main Blade Body)
  // Triangular thin blade extending medially (-X) and inferiorly (-Y)
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-5, 0); // Near glenoid neck
  bladeShape.lineTo(-75, 45); // Superior angle
  bladeShape.lineTo(-120, -10); // Medial / vertebral border
  bladeShape.lineTo(-45, -110); // Inferior angle
  bladeShape.bezierCurveTo(-25, -70, -15, -30, -5, 0); // Lateral border returning to neck

  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 4.5,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 2,
    bevelThickness: 2,
  });
  bladeGeo.center();
  const bladeMesh = new THREE.Mesh(bladeGeo, scapulaMaterial);
  bladeMesh.position.set(-48, -25, -2);
  bladeMesh.rotation.y = 0.12; // Anatomical anteversion of scapular blade
  bladeMesh.castShadow = true;
  bladeMesh.receiveShadow = true;
  scapulaGroup.add(bladeMesh);

  // C. Spine of the Scapula & Acromion Process
  // The spine rises from posterior blade surface and arches laterally into the acromion roof
  const acromionCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-60, 15, -12), // Medial triangular start of spine
    new THREE.Vector3(-30, 22, -18), // Mid-spine crest
    new THREE.Vector3(-5, 30, -14),  // Acromial angle
    new THREE.Vector3(12, 32, -4),   // Posterior acromion
    new THREE.Vector3(15, 30, 12),   // Anterior acromial tip (overhanging glenohumeral joint)
  ]);

  const acromionGeo = new THREE.TubeGeometry(acromionCurve, 32, 5.5, 12, false);
  const acromionMesh = new THREE.Mesh(acromionGeo, scapulaMaterial);
  acromionMesh.castShadow = true;
  acromionMesh.receiveShadow = true;
  scapulaGroup.add(acromionMesh);

  // D. Coracoid Process
  // Hook-like projection anteriorly and superiorly
  const coracoidCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2, 8, 14),   // Base arising from superior glenoid neck
    new THREE.Vector3(4, 18, 22),   // Ascending vertical pillar
    new THREE.Vector3(14, 19, 25),  // Anterior bend
    new THREE.Vector3(22, 17, 24),  // Coracoid apex (pectoralis minor attachment)
  ]);
  const coracoidGeo = new THREE.TubeGeometry(coracoidCurve, 20, 3.8, 10, false);
  const coracoidMesh = new THREE.Mesh(coracoidGeo, scapulaMaterial);
  coracoidMesh.castShadow = true;
  coracoidMesh.receiveShadow = true;
  scapulaGroup.add(coracoidMesh);

  // --- 2. PROXIMAL HUMERUS ANATOMY ---
  // A. Hemispherical Humeral Head
  // Articulates with glenoid socket (+X side)
  const headGeo = new THREE.SphereGeometry(24, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.65);
  const headMesh = new THREE.Mesh(headGeo, humerusMaterial);
  // Positioned directly facing glenoid face with physiological 3mm joint space
  headMesh.rotation.z = -Math.PI / 2 + 0.35; // ~135 degree neck-shaft angle
  headMesh.position.set(0, 0, 0);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  humerusGroup.add(headMesh);

  // B. Greater & Lesser Tuberosities & Bicipital Groove
  const tuberosityGeo = new THREE.CylinderGeometry(18, 20, 22, 24);
  const tuberosityMesh = new THREE.Mesh(tuberosityGeo, humerusMaterial);
  tuberosityMesh.position.set(16, -14, 0);
  tuberosityMesh.rotation.z = 0.25;
  tuberosityMesh.castShadow = true;
  tuberosityMesh.receiveShadow = true;
  humerusGroup.add(tuberosityMesh);

  // C. Humeral Diaphysis / Shaft extending inferiorly
  const shaftGeo = new THREE.CylinderGeometry(15, 12, 110, 24);
  const shaftMesh = new THREE.Mesh(shaftGeo, humerusMaterial);
  shaftMesh.position.set(18, -75, 0);
  shaftMesh.castShadow = true;
  shaftMesh.receiveShadow = true;
  humerusGroup.add(shaftMesh);

  // Default positioning: Position Humerus opposite Glenoid face
  humerusGroup.position.set(32, 0, 0);

  // --- 3. VIRTUAL ARTHROPLASTY IMPLANTS (Pre-configured for reverse TSA) ---
  // Metaglene baseplate (attached to glenoid)
  const baseplateGeo = new THREE.CylinderGeometry(14, 14, 4, 32);
  const baseplateMesh = new THREE.Mesh(baseplateGeo, implantMetalMaterial);
  baseplateMesh.rotation.z = Math.PI / 2;
  baseplateMesh.position.set(2, 0, 0);
  implantGroup.add(baseplateMesh);

  // Glenosphere (39mm spherical implant head)
  const glenosphereGeo = new THREE.SphereGeometry(19.5, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const glenosphereMesh = new THREE.Mesh(glenosphereGeo, implantMetalMaterial);
  glenosphereMesh.rotation.z = -Math.PI / 2;
  glenosphereMesh.position.set(6, 0, 0);
  implantGroup.add(glenosphereMesh);

  // Humeral Stem & Polyethylene Cup
  const humeralCupGeo = new THREE.CylinderGeometry(18, 16, 8, 32);
  const humeralCupMesh = new THREE.Mesh(humeralCupGeo, implantPolyMaterial);
  humeralCupMesh.rotation.z = Math.PI / 2;
  humeralCupMesh.position.set(28, 0, 0);
  implantGroup.add(humeralCupMesh);

  const humeralStemGeo = new THREE.ConeGeometry(9, 65, 20);
  const humeralStemMesh = new THREE.Mesh(humeralStemGeo, implantMetalMaterial);
  humeralStemMesh.position.set(34, -40, 0);
  humeralStemMesh.rotation.z = -0.15;
  implantGroup.add(humeralStemMesh);

  rootGroup.add(scapulaGroup);
  rootGroup.add(humerusGroup);
  rootGroup.add(implantGroup);

  return {
    group: rootGroup,
    scapulaGroup,
    humerusGroup,
    implantGroup,
    materials: {
      scapula: scapulaMaterial,
      humerus: humerusMaterial,
      cartilage: cartilageMaterial,
      implantMetal: implantMetalMaterial,
      implantPoly: implantPolyMaterial,
    },
  };
}
