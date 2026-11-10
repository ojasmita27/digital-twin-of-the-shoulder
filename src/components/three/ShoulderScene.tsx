/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildProceduralShoulder, ProceduralShoulderModel } from './ProceduralAnatomy';
import { LandmarkMarkersManager } from './LandmarkMarkers';
import { ReferencePointMarkersManager } from './ReferencePointMarkers';
import { parseModelArrayBuffer, LoadedMeshResult } from './STLLoaderUtil';
import { AnatomicalLandmark, ImplantReferencePoint, ImplantSpatialAnalysis } from '../../types/case';
import {
  RotateCcw,
  Layers,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Upload,
  Grid,
  Sun,
  MapPin,
  ChevronUp,
  ChevronDown,
  Info,
  Sliders,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export type CameraPreset =
  | 'anterior'
  | 'posterior'
  | 'lateral'
  | 'medial'
  | 'superior'
  | 'inferior'
  | 'glenoid_en_face';

export type ShadingMode = 'bone_ivory' | 'wireframe' | 'xray' | 'normal';
type UnitScale = 'unknown' | 'mm' | 'cm' | 'in';

export interface SceneMeasurementOverlay {
  id: string;
  points: Array<[number, number, number]>;
  label: string;
  value: number;
  unit: UnitScale;
  selected?: boolean;
}

interface ShoulderSceneProps {
  landmarks?: AnatomicalLandmark[];
  showImplants?: boolean;
  activeLandmarkId?: string | null;
  onSelectLandmark?: (landmark: AnatomicalLandmark | null) => void;
  customStlBuffer?: ArrayBuffer | null;
  customModelName?: string;
  onMeshLoaded?: (meshInfo: LoadedMeshResult, file: { name: string; size: number; file: File; buffer: ArrayBuffer }) => void;
  onMeshRemoved?: () => void;
  onMeshError?: (message: string) => void;
  onMeasurement?: (points: { pointA: [number, number, number]; pointB: [number, number, number]; distance: number }) => void;
  landmarkMode?: boolean;
  landmarkMoveMode?: boolean;
  onLandmarkMove?: (landmarkId: string, point: [number, number, number]) => void;
  implantBuffer?: ArrayBuffer | null;
  implantModelName?: string;
  implantTransform?: { translation: [number, number, number]; rotationDeg: [number, number, number] };
  showBone?: boolean;
  showImplant?: boolean;
  onImplantError?: (message: string) => void;
  onSpatialAnalysis?: (analysis: ImplantSpatialAnalysis | null) => void;
  onLandmarkPoint?: (point: [number, number, number]) => void;
  unitScale?: UnitScale;
  onUnitScaleChange?: (unit: UnitScale) => void;
  implantTransformMode?: 'translate' | 'rotate';
  implantGizmoEnabled?: boolean;
  onImplantTransformChange?: (transform: { translation: [number, number, number]; rotationDeg: [number, number, number] }) => void;
  implantReferenceMode?: boolean;
  onImplantReferencePoint?: (point: [number, number, number]) => void;
  implantReferencePoints?: ImplantReferencePoint[];
  selectedImplantReferencePointId?: string | null;
  showImplantReferencePoints?: boolean;
  onSelectImplantReferencePoint?: (point: ImplantReferencePoint | null) => void;
  measurementOverlays?: SceneMeasurementOverlay[];
  showMeasurementOverlays?: boolean;
  scapulaVisible?: boolean;
  humerusVisible?: boolean;
  showLandmarks?: boolean;
  onVisibilityChange?: (visibility: { scapulaVisible: boolean; humerusVisible: boolean; glenoidVisible?: boolean; landmarksVisible: boolean }) => void;
  scapulaBuffer?: ArrayBuffer | null;
  humerusBuffer?: ArrayBuffer | null;
  glenoidBuffer?: ArrayBuffer | null;
  scapulaColor?: string;
  humerusColor?: string;
  glenoidColor?: string;
  scapulaOpacity?: number;
  humerusOpacity?: number;
  glenoidOpacity?: number;
  glenoidVisible?: boolean;
}

export const ShoulderScene: React.FC<ShoulderSceneProps> = ({
  landmarks = [],
  showImplants = false,
  activeLandmarkId = null,
  onSelectLandmark,
  customStlBuffer = null,
  customModelName = 'imported.stl',
  onMeshLoaded,
  onMeshRemoved,
  onMeshError,
  onMeasurement,
  landmarkMode = false,
  landmarkMoveMode = false,
  onLandmarkMove,
  implantBuffer = null,
  implantModelName = 'implant.stl',
  implantTransform,
  showBone = true,
  showImplant = true,
  onImplantError,
  onSpatialAnalysis,
  onLandmarkPoint,
  unitScale: unitScaleProp,
  onUnitScaleChange,
  implantTransformMode = 'translate',
  implantGizmoEnabled = false,
  onImplantTransformChange,
  implantReferenceMode = false,
  onImplantReferencePoint,
  implantReferencePoints = [],
  selectedImplantReferencePointId = null,
  showImplantReferencePoints = true,
  onSelectImplantReferencePoint,
  measurementOverlays = [],
  showMeasurementOverlays = true,
  scapulaVisible: scapulaVisibleProp,
  humerusVisible: humerusVisibleProp,
  showLandmarks: showLandmarksProp,
  onVisibilityChange,
  scapulaBuffer = null,
  humerusBuffer = null,
  glenoidBuffer = null,
  scapulaColor = '#e8dec8',
  humerusColor = '#cbd5e1',
  glenoidColor = '#67e8f9',
  scapulaOpacity = 1.0,
  humerusOpacity = 1.0,
  glenoidOpacity = 0.9,
  glenoidVisible: glenoidVisibleProp,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Model refs
  const modelRef = useRef<ProceduralShoulderModel | null>(null);
  const customMeshRef = useRef<THREE.Mesh | null>(null);
  const scapulaMeshRef = useRef<THREE.Mesh | null>(null);
  const humerusMeshRef = useRef<THREE.Mesh | null>(null);
  const glenoidMeshRef = useRef<THREE.Mesh | null>(null);
  const implantMeshRef = useRef<THREE.Object3D | null>(null);
  const measurementGroupRef = useRef<THREE.Group | null>(null);
  const landmarksManagerRef = useRef<LandmarkMarkersManager | null>(null);
  const referenceMarkersManagerRef = useRef<ReferencePointMarkersManager | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);

  // Lighting refs
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);

  // Theme context
  const { theme } = useTheme();

  // Interactive UI state
  const [shadingMode, setShadingMode] = useState<ShadingMode>('bone_ivory');
  const [scapulaVisible, setScapulaVisible] = useState(true);
  const [humerusVisible, setHumerusVisible] = useState(true);
  const [glenoidVisible, setGlenoidVisible] = useState(true);
  const [cartilageVisible, setCartilageVisible] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [distractionMm, setDistractionMm] = useState(0); // 0 - 60mm joint distraction
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [hoveredLandmark, setHoveredLandmark] = useState<AnatomicalLandmark | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPreset>('anterior');
  const [loadedCustomName, setLoadedCustomName] = useState<string | null>(null);
  const [customMeshError, setCustomMeshError] = useState<string | null>(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurementDistance, setMeasurementDistance] = useState<number | null>(null);
  const [unitScale, setUnitScale] = useState<UnitScale>(unitScaleProp || 'unknown');
  const resolvedScapulaVisible = scapulaVisibleProp ?? scapulaVisible;
  const resolvedHumerusVisible = humerusVisibleProp ?? humerusVisible;
  const resolvedGlenoidVisible = glenoidVisibleProp ?? glenoidVisible;
  const resolvedShowLandmarks = showLandmarksProp ?? showLandmarks;
  const measureModeRef = useRef(false);
  const landmarkModeRef = useRef(landmarkMode);
  const onLandmarkPointRef = useRef(onLandmarkPoint);
  const landmarkMoveModeRef = useRef(landmarkMoveMode);
  const onLandmarkMoveRef = useRef(onLandmarkMove);
  const activeLandmarkIdRef = useRef(activeLandmarkId);
  const onSelectLandmarkRef = useRef(onSelectLandmark);
  const onMeasurementRef = useRef(onMeasurement);
  const onImplantTransformChangeRef = useRef(onImplantTransformChange);
  const implantReferenceModeRef = useRef(implantReferenceMode);
  const onSpatialAnalysisRef = useRef(onSpatialAnalysis);
  const onImplantReferencePointRef = useRef(onImplantReferencePoint);
  const onSelectImplantReferencePointRef = useRef(onSelectImplantReferencePoint);
  const implantTransformModeRef = useRef(implantTransformMode);
  useEffect(() => {
    if (unitScaleProp) setUnitScale(unitScaleProp);
  }, [unitScaleProp]);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);
  useEffect(() => {
    landmarkModeRef.current = landmarkMode;
    onLandmarkPointRef.current = onLandmarkPoint;
    landmarkMoveModeRef.current = landmarkMoveMode;
    onLandmarkMoveRef.current = onLandmarkMove;
    activeLandmarkIdRef.current = activeLandmarkId;
    onMeasurementRef.current = onMeasurement;
    onSelectLandmarkRef.current = onSelectLandmark;
    onImplantTransformChangeRef.current = onImplantTransformChange;
    implantReferenceModeRef.current = implantReferenceMode;
    onImplantReferencePointRef.current = onImplantReferencePoint;
    onSelectImplantReferencePointRef.current = onSelectImplantReferencePoint;
    implantTransformModeRef.current = implantTransformMode;
    onSpatialAnalysisRef.current = onSpatialAnalysis;
  }, [activeLandmarkId, landmarkMode, landmarkMoveMode, onLandmarkPoint, onLandmarkMove, onMeasurement, onSelectLandmark, onImplantTransformChange, implantReferenceMode, onImplantReferencePoint, onSelectImplantReferencePoint, implantTransformMode, onSpatialAnalysis]);

  const fitObjectToView = (object: THREE.Object3D) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = Math.max(sphere.radius * 2.4, 1);
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).add(new THREE.Vector3(0, sphere.radius * 0.35, distance));
    camera.near = Math.max(sphere.radius / 1000, 0.01);
    camera.far = Math.max(sphere.radius * 20, 100);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(sphere.radius * 0.05, 0.01);
    controls.maxDistance = Math.max(sphere.radius * 20, 100);
    controls.update();
  };

  const setImplantMeshTransform = (
    mesh: THREE.Object3D,
    transform?: { translation: [number, number, number]; rotationDeg: [number, number, number] },
  ) => {
    const translation = transform?.translation || [0, 0, 0];
    const rotation = transform?.rotationDeg || [0, 0, 0];
    mesh.position.set(...translation);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(rotation[0]),
      THREE.MathUtils.degToRad(rotation[1]),
      THREE.MathUtils.degToRad(rotation[2]),
    );
  };

  // Initialize Three.js scene once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 500;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b12'); // Deep obsidian slate
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.set(0, 10, 240); // Default Anterior-Lateral
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    mount.appendChild(renderer.domElement);

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 500;
    controls.minDistance = 20;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode(implantTransformModeRef.current);
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
    });
    transformControls.addEventListener('objectChange', () => {
      const object = transformControls.object;
      if (!object) return;
      onImplantTransformChangeRef.current?.({
        translation: [object.position.x, object.position.y, object.position.z],
        rotationDeg: [
          THREE.MathUtils.radToDeg(object.rotation.x),
          THREE.MathUtils.radToDeg(object.rotation.y),
          THREE.MathUtils.radToDeg(object.rotation.z),
        ],
      });
    });
    scene.add(transformControls.getHelper());
    transformControlsRef.current = transformControls;

    // 5. Lighting
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x090d16, 0.7);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(80, 120, 100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 400;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const backRimLight = new THREE.DirectionalLight(0x06b6d4, 0.5);
    backRimLight.position.set(-80, -40, -100);
    scene.add(backRimLight);

    // 6. Helpers (Grid and Axes)
    const grid = new THREE.GridHelper(200, 20, 0x1e293b, 0x0f172a);
    grid.position.y = -100;
    scene.add(grid);
    gridHelperRef.current = grid;

    const axes = new THREE.AxesHelper(35);
    axes.position.set(-80, -80, 0);
    scene.add(axes);
    axesHelperRef.current = axes;

    // 7. Load Anatomical Procedural Model
    const model = buildProceduralShoulder();
    scene.add(model.group);
    modelRef.current = model;

    // 8. Landmark Markers Manager
    const landmarkMgr = new LandmarkMarkersManager();
    scene.add(landmarkMgr.getGroup());
    landmarksManagerRef.current = landmarkMgr;
    const referenceMgr = new ReferencePointMarkersManager();
    scene.add(referenceMgr.getGroup());
    referenceMarkersManagerRef.current = referenceMgr;
    const measurementGroup = new THREE.Group();
    scene.add(measurementGroup);
    measurementGroupRef.current = measurementGroup;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handleMeshClick = (event: MouseEvent) => {
      const targetMeshes = [customMeshRef.current, scapulaMeshRef.current, humerusMeshRef.current].filter(
        (m): m is THREE.Mesh => m !== null && m.visible,
      );
      if (targetMeshes.length === 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const landmarkHit = raycaster.intersectObjects(landmarksManagerRef.current?.getGroup().children || [], true)[0];
      const referenceHit = raycaster.intersectObjects(referenceMarkersManagerRef.current?.getGroup().children || [], true)[0];
      if (referenceHit && !implantReferenceModeRef.current) {
        onSelectImplantReferencePointRef.current?.(
          referenceHit.object.userData.referencePoint || referenceHit.object.parent?.userData.referencePoint || null,
        );
        return;
      }
      if (landmarkHit && !landmarkModeRef.current && !landmarkMoveModeRef.current && !measureModeRef.current) {
        onSelectLandmarkRef.current?.(landmarkHit.object.userData.landmark || landmarkHit.object.parent?.userData.landmark || null);
        return;
      }
      if (implantReferenceModeRef.current && implantMeshRef.current) {
        const implantHit = raycaster.intersectObject(implantMeshRef.current, true)[0];
        if (implantHit) {
          onImplantReferencePointRef.current?.(implantHit.point.toArray() as [number, number, number]);
          return;
        }
      }
      const hit = raycaster.intersectObjects(targetMeshes, false)[0];
      if (!hit) return;
      if (landmarkMoveModeRef.current) {
        if (activeLandmarkIdRef.current && onLandmarkMoveRef.current) {
          onLandmarkMoveRef.current(activeLandmarkIdRef.current, hit.point.toArray() as [number, number, number]);
        }
        return;
      }
      if (landmarkModeRef.current) {
        onLandmarkPointRef.current?.(hit.point.toArray() as [number, number, number]);
        return;
      }
      if (!measureModeRef.current || !measurementGroupRef.current) return;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(hit.distance * 0.012, 0.5), 12, 12),
        new THREE.MeshBasicMaterial({ color: '#22d3ee' }),
      );
      marker.position.copy(hit.point);
      measurementGroupRef.current.add(marker);
      const points = measurementGroupRef.current.children.filter((child) => child instanceof THREE.Mesh);
      if (points.length > 2) {
        const first = points.shift();
        if (first) {
          first.geometry.dispose();
          (first.material as THREE.Material).dispose();
          measurementGroupRef.current.remove(first);
        }
      }
      if (points.length === 2) {
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(
          points.map((point) => point.position),
        );
        const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: '#f59e0b' }));
        measurementGroupRef.current.add(line);
        const distance = points[0].position.distanceTo(points[1].position);
        setMeasurementDistance(distance);
        onMeasurementRef.current?.({
          pointA: points[0].position.toArray() as [number, number, number],
          pointB: points[1].position.toArray() as [number, number, number],
          distance,
        });
      }
    };
    renderer.domElement.addEventListener('click', handleMeshClick);

    // Pre-warm shaders
    renderer.compile(scene, camera);

    // Resize Handler
    const handleResize = () => {
      if (!mount || !renderer || !camera) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // Animation Render Loop
    let running = true;
    const animate = () => {
      if (!running) return;
      controls.update();
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      running = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      transformControls.detach();
      transformControls.dispose();
      scene.remove(transformControls.getHelper());
      renderer.domElement.removeEventListener('click', handleMeshClick);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (!customStlBuffer || !sceneRef.current) return;
    try {
      const meshInfo = parseModelArrayBuffer(customStlBuffer, customModelName);
      if (customMeshRef.current) {
        sceneRef.current.remove(customMeshRef.current);
        customMeshRef.current.geometry.dispose();
        (customMeshRef.current.material as THREE.Material).dispose();
      }
      const mesh = new THREE.Mesh(
        meshInfo.geometry,
        new THREE.MeshStandardMaterial({
          color: '#e8dec9',
          roughness: 0.65,
          metalness: 0.05,
          side: THREE.DoubleSide,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      sceneRef.current.add(mesh);
      customMeshRef.current = mesh;
      setLoadedCustomName('Imported STL');
      setCustomMeshError(null);
      if (modelRef.current) modelRef.current.group.visible = false;
      fitObjectToView(mesh);
      const restoredFile = new File([customStlBuffer], customModelName, { type: 'application/octet-stream' });
      onMeshLoaded?.(meshInfo, { name: restoredFile.name, size: restoredFile.size, file: restoredFile, buffer: customStlBuffer });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The STL file could not be parsed.';
      setCustomMeshError(message);
      onMeshError?.(message);
    }
  }, [customStlBuffer]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (scapulaMeshRef.current) {
      scene.remove(scapulaMeshRef.current);
      scapulaMeshRef.current.geometry.dispose();
      (scapulaMeshRef.current.material as THREE.Material).dispose();
      scapulaMeshRef.current = null;
    }
    if (!scapulaBuffer) return;
    try {
      const meshInfo = parseModelArrayBuffer(scapulaBuffer, 'scapula.stl');
      const mesh = new THREE.Mesh(
        meshInfo.geometry,
        new THREE.MeshStandardMaterial({
          color: scapulaColor,
          roughness: 0.62,
          metalness: 0.05,
          transparent: scapulaOpacity < 1.0,
          opacity: scapulaOpacity,
          side: THREE.DoubleSide,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = resolvedScapulaVisible;
      scene.add(mesh);
      scapulaMeshRef.current = mesh;
      if (modelRef.current) modelRef.current.group.visible = false;
      if (customMeshRef.current) customMeshRef.current.visible = false;
      const group = new THREE.Group();
      group.add(mesh.clone());
      if (humerusMeshRef.current) group.add(humerusMeshRef.current.clone());
      fitObjectToView(group);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The scapula STL file could not be parsed.';
      setCustomMeshError(message);
      onMeshError?.(message);
    }
  }, [scapulaBuffer]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (humerusMeshRef.current) {
      scene.remove(humerusMeshRef.current);
      humerusMeshRef.current.geometry.dispose();
      (humerusMeshRef.current.material as THREE.Material).dispose();
      humerusMeshRef.current = null;
    }
    if (!humerusBuffer) return;
    try {
      const meshInfo = parseModelArrayBuffer(humerusBuffer, 'humerus.stl');
      const mesh = new THREE.Mesh(
        meshInfo.geometry,
        new THREE.MeshStandardMaterial({
          color: humerusColor,
          roughness: 0.6,
          metalness: 0.05,
          transparent: humerusOpacity < 1.0,
          opacity: humerusOpacity,
          side: THREE.DoubleSide,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = resolvedHumerusVisible;
      scene.add(mesh);
      humerusMeshRef.current = mesh;
      if (modelRef.current) modelRef.current.group.visible = false;
      if (customMeshRef.current) customMeshRef.current.visible = false;
      const group = new THREE.Group();
      if (scapulaMeshRef.current) group.add(scapulaMeshRef.current.clone());
      group.add(mesh.clone());
      fitObjectToView(group);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The humerus STL file could not be parsed.';
      setCustomMeshError(message);
      onMeshError?.(message);
    }
  }, [humerusBuffer]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (glenoidMeshRef.current) {
      scene.remove(glenoidMeshRef.current);
      glenoidMeshRef.current.geometry.dispose();
      (glenoidMeshRef.current.material as THREE.Material).dispose();
      glenoidMeshRef.current = null;
    }
    if (!glenoidBuffer) return;
    try {
      const meshInfo = parseModelArrayBuffer(glenoidBuffer, 'glenoid.stl');
      const mesh = new THREE.Mesh(
        meshInfo.geometry,
        new THREE.MeshStandardMaterial({
          color: glenoidColor,
          roughness: 0.58,
          metalness: 0.05,
          transparent: glenoidOpacity < 1.0,
          opacity: glenoidOpacity,
          side: THREE.DoubleSide,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = resolvedGlenoidVisible;
      scene.add(mesh);
      glenoidMeshRef.current = mesh;
      if (modelRef.current) modelRef.current.group.visible = false;
      fitObjectToView(mesh);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The glenoid STL file could not be parsed.';
      setCustomMeshError(message);
      onMeshError?.(message);
    }
  }, [glenoidBuffer]);

  useEffect(() => {
    if (scapulaMeshRef.current) {
      const mat = scapulaMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set(scapulaColor);
      mat.transparent = scapulaOpacity < 1.0;
      mat.opacity = scapulaOpacity;
      mat.needsUpdate = true;
    }
    if (humerusMeshRef.current) {
      const mat = humerusMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set(humerusColor);
      mat.transparent = humerusOpacity < 1.0;
      mat.opacity = humerusOpacity;
      mat.needsUpdate = true;
    }
    if (glenoidMeshRef.current) {
      const mat = glenoidMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set(glenoidColor);
      mat.transparent = glenoidOpacity < 1.0;
      mat.opacity = glenoidOpacity;
      mat.needsUpdate = true;
    }
  }, [scapulaColor, scapulaOpacity, humerusColor, humerusOpacity, glenoidColor, glenoidOpacity]);

  useEffect(() => {
    if (!implantBuffer || !sceneRef.current) return;
    const scene = sceneRef.current;
    let cancelled = false;
    const mountImplant = (geometry: THREE.BufferGeometry | null, root?: THREE.Object3D) => {
      if (!geometry && !root) throw new Error('The implant file did not contain renderable geometry.');
      if (implantMeshRef.current) {
        scene.remove(implantMeshRef.current);
        implantMeshRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => material.dispose());
          }
        });
      }
      const implant = root || new THREE.Mesh(geometry as THREE.BufferGeometry, new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#7c2d12',
        emissiveIntensity: 0.15,
        metalness: 0.65,
        roughness: 0.3,
        side: THREE.DoubleSide,
      }));
      implant.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(implant);
      implantMeshRef.current = implant;
      setImplantMeshTransform(implant, implantTransform);
      if (geometry) geometry.computeBoundingBox();
    };
    const load = async () => {
      try {
        if (implantModelName.toLowerCase().endsWith('.glb')) {
          const loader = new GLTFLoader();
          const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => loader.parse(implantBuffer, '', resolve, reject));
          if (!cancelled) mountImplant(null, gltf.scene);
        } else {
          const meshInfo = parseModelArrayBuffer(implantBuffer, implantModelName);
          if (!cancelled) mountImplant(meshInfo.geometry);
        }
      } catch (error) {
        if (!cancelled) onImplantError?.(error instanceof Error ? error.message : 'The implant file could not be parsed.');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [implantBuffer, implantModelName]);

  useEffect(() => {
    const bone = customMeshRef.current;
    const implant = implantMeshRef.current;
    if (!bone || !implant) {
      onSpatialAnalysis?.(null);
      return;
    }
    bone.updateMatrixWorld(true);
    implant.updateMatrixWorld(true);
    const boneBox = new THREE.Box3().setFromObject(bone);
    const implantBox = new THREE.Box3().setFromObject(implant);
    const intersects = boneBox.intersectsBox(implantBox);
    const outside = !intersects;
    const dimensions = (box: THREE.Box3): [number, number, number] => box.getSize(new THREE.Vector3()).toArray() as [number, number, number];
    const tuple = (value: THREE.Vector3): [number, number, number] => value.toArray() as [number, number, number];
    onSpatialAnalysis?.({
      status: 'current',
      method: 'axis_aligned_bounding_box',
      implantBounds: { min: tuple(implantBox.min), max: tuple(implantBox.max), dimensions: dimensions(implantBox) },
      boneBounds: { min: tuple(boneBox.min), max: tuple(boneBox.max), dimensions: dimensions(boneBox) },
      intersects,
      implantOutsideBone: outside,
      warnings: [
        ...(intersects ? ['Bounding boxes overlap. This is a geometric screening result, not clinical fit validation.'] : []),
        ...(outside ? ['The implant bounding box is outside the selected patient model region.'] : []),
      ],
      patientModelId: '',
      patientModelVersion: 0,
      implantAssetId: '',
      implantAssetVersion: 0,
      computedAt: new Date().toISOString(),
    });
  }, [implantTransform, implantBuffer, customStlBuffer, showBone, showImplant, onSpatialAnalysis]);

  useEffect(() => {
    if (customMeshRef.current) customMeshRef.current.visible = showBone;
  }, [showBone]);

  useEffect(() => {
    if (implantMeshRef.current) {
      implantMeshRef.current.visible = showImplant;
      setImplantMeshTransform(implantMeshRef.current, implantTransform);
    }
  }, [implantTransform, showImplant]);

  useEffect(() => {
    const group = measurementGroupRef.current;
    if (!group) return;
    group.clear();
    if (!showMeasurementOverlays) return;
    measurementOverlays.forEach((measurement) => {
      const points = measurement.points.map((point) => new THREE.Vector3(...point));
      const markerMaterial = new THREE.MeshBasicMaterial({ color: measurement.selected ? '#facc15' : '#22d3ee' });
      points.forEach((point) => {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 12), markerMaterial.clone());
        marker.position.copy(point);
        group.add(marker);
      });
      const lineMaterial = new THREE.LineBasicMaterial({ color: measurement.selected ? '#facc15' : '#22d3ee' });
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
      if (points.length === 3) {
        group.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([points[1], points[0], points[1], points[2]]),
          lineMaterial.clone(),
        ));
      }
    });
  }, [measurementOverlays, showMeasurementOverlays]);

  useEffect(() => {
    const gizmo = transformControlsRef.current;
    const implant = implantMeshRef.current;
    if (!gizmo) return;
    gizmo.setMode(implantTransformMode);
    if (implantGizmoEnabled && showImplant && implant) gizmo.attach(implant);
    else gizmo.detach();
  }, [implantGizmoEnabled, implantTransformMode, showImplant, implantBuffer]);

  useEffect(() => {
    const manager = referenceMarkersManagerRef.current;
    if (!manager) return;
    manager.update(implantReferencePoints, implantTransform || { translation: [0, 0, 0], rotationDeg: [0, 0, 0] }, selectedImplantReferencePointId);
    manager.setVisible(showImplantReferencePoints && showImplant);
  }, [implantReferencePoints, selectedImplantReferencePointId, showImplantReferencePoints, showImplant, implantTransform]);

  // Update Theme in Three.js Scene
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    if (theme === 'light') {
      scene.background = new THREE.Color('#f8fafc');
      if (hemiLightRef.current) {
        hemiLightRef.current.color.setHex(0xffffff);
        hemiLightRef.current.groundColor.setHex(0xcbd5e1);
        hemiLightRef.current.intensity = 0.9;
      }
      if (dirLightRef.current) {
        dirLightRef.current.intensity = 1.35;
      }
    } else {
      scene.background = new THREE.Color('#070b12');
      if (hemiLightRef.current) {
        hemiLightRef.current.color.setHex(0xe0f2fe);
        hemiLightRef.current.groundColor.setHex(0x090d16);
        hemiLightRef.current.intensity = 0.7;
      }
      if (dirLightRef.current) {
        dirLightRef.current.intensity = 1.2;
      }
    }
  }, [theme]);

  // Update landmarks
  useEffect(() => {
    if (landmarksManagerRef.current) {
      landmarksManagerRef.current.updateLandmarks(landmarks, activeLandmarkId);
      landmarksManagerRef.current.setVisible(resolvedShowLandmarks);
    }
  }, [landmarks, activeLandmarkId, resolvedShowLandmarks]);

  // Update Implants visibility
  useEffect(() => {
    if (modelRef.current) {
      modelRef.current.implantGroup.visible = showImplants;
    }
  }, [showImplants]);

  // Update Joint Distraction (Exploded View along Joint Vector)
  useEffect(() => {
    if (modelRef.current) {
      // Humerus rests normally at X: 32; distraction translates it along X axis
      modelRef.current.humerusGroup.position.x = 32 + distractionMm;
    }
  }, [distractionMm]);

  // Update Component Visibilities
  useEffect(() => {
    if (modelRef.current) {
      modelRef.current.scapulaGroup.visible = resolvedScapulaVisible;
      modelRef.current.humerusGroup.visible = resolvedHumerusVisible;
      modelRef.current.materials.cartilage.visible = cartilageVisible;
    }
    if (scapulaMeshRef.current) {
      scapulaMeshRef.current.visible = resolvedScapulaVisible;
    }
    if (humerusMeshRef.current) {
      humerusMeshRef.current.visible = resolvedHumerusVisible;
    }
    if (glenoidMeshRef.current) {
      glenoidMeshRef.current.visible = resolvedGlenoidVisible;
    }
  }, [resolvedScapulaVisible, resolvedHumerusVisible, resolvedGlenoidVisible, cartilageVisible]);

  // Update Helpers
  useEffect(() => {
    if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
    if (axesHelperRef.current) axesHelperRef.current.visible = showAxes;
  }, [showGrid, showAxes]);

  // Update Shading Modes
  useEffect(() => {
    const customMaterial = customMeshRef.current?.material;
    if (customMaterial instanceof THREE.MeshStandardMaterial) {
      customMaterial.wireframe = shadingMode === 'wireframe';
      customMaterial.transparent = shadingMode === 'xray';
      customMaterial.opacity = shadingMode === 'xray' ? 0.35 : 1;
      customMaterial.color.set(
        shadingMode === 'wireframe' ? '#06b6d4' :
          shadingMode === 'normal' ? '#a7f3d0' :
            shadingMode === 'xray' ? '#38bdf8' : '#e8dec9',
      );
      customMaterial.roughness = shadingMode === 'normal' ? 0.4 : 0.65;
    }
    if (!modelRef.current) return;
    const { scapula, humerus } = modelRef.current.materials;

    if (shadingMode === 'bone_ivory') {
      scapula.wireframe = false;
      scapula.transparent = false;
      scapula.opacity = 1.0;
      scapula.color.set('#e8dec9');
      scapula.roughness = 0.65;

      humerus.wireframe = false;
      humerus.transparent = false;
      humerus.opacity = 1.0;
      humerus.color.set('#dfd4be');
      humerus.roughness = 0.62;
    } else if (shadingMode === 'wireframe') {
      scapula.wireframe = true;
      scapula.color.set('#06b6d4');
      scapula.transparent = false;
      scapula.opacity = 1.0;

      humerus.wireframe = true;
      humerus.color.set('#38bdf8');
      humerus.transparent = false;
      humerus.opacity = 1.0;
    } else if (shadingMode === 'xray') {
      scapula.wireframe = false;
      scapula.transparent = true;
      scapula.opacity = 0.35;
      scapula.color.set('#38bdf8');
      scapula.roughness = 0.1;

      humerus.wireframe = false;
      humerus.transparent = true;
      humerus.opacity = 0.35;
      humerus.color.set('#818cf8');
      humerus.roughness = 0.1;
    } else if (shadingMode === 'normal') {
      scapula.wireframe = false;
      scapula.transparent = false;
      scapula.opacity = 1.0;
      scapula.color.set('#a7f3d0');
      scapula.roughness = 0.4;

      humerus.wireframe = false;
      humerus.transparent = false;
      humerus.opacity = 1.0;
      humerus.color.set('#fde68a');
      humerus.roughness = 0.4;
    }
  }, [shadingMode, loadedCustomName]);

  // Handle Camera Presets
  const applyCameraPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    controls.target.set(0, 0, 0);

    switch (preset) {
      case 'anterior':
        camera.position.set(0, 0, 240);
        break;
      case 'posterior':
        camera.position.set(0, 0, -240);
        break;
      case 'lateral':
        camera.position.set(240, 0, 0);
        break;
      case 'medial':
        camera.position.set(-240, 0, 0);
        break;
      case 'superior':
        camera.position.set(0, 240, 0);
        break;
      case 'inferior':
        camera.position.set(0, -240, 0);
        break;
      case 'glenoid_en_face':
        // Specifically looks directly at the lateral face of the glenoid (from +X looking towards -X)
        camera.position.set(160, 0, 0);
        controls.target.set(0, 0, 0);
        break;
    }
    controls.update();
  };

  const handleResetCamera = () => {
    if (scapulaMeshRef.current || humerusMeshRef.current) {
      const group = new THREE.Group();
      if (scapulaMeshRef.current) group.add(scapulaMeshRef.current.clone());
      if (humerusMeshRef.current) group.add(humerusMeshRef.current.clone());
      fitObjectToView(group);
    } else if (customMeshRef.current) {
      fitObjectToView(customMeshRef.current);
    } else {
      applyCameraPreset('anterior');
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Custom STL File Upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const fail = (message: string) => {
      setCustomMeshError(message);
      onMeshError?.(message);
    };
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension !== 'stl' && extension !== 'ply' && extension !== 'obj') {
      fail('Only STL, PLY, and OBJ files are supported.');
      return;
    }
    if (file.size === 0) {
      fail('The selected STL file is empty.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      fail('The STL file exceeds the 100 MB size limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (buffer) {
        try {
          const meshInfo = parseModelArrayBuffer(buffer, file.name);
          if (sceneRef.current) {
            // Remove previous custom mesh if exists
            if (customMeshRef.current) {
              sceneRef.current.remove(customMeshRef.current);
            }

            const mat = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#38bdf8'),
              roughness: 0.5,
              metalness: 0.1,
              side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(meshInfo.geometry, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            mesh.position.set(0, 0, 0);

            sceneRef.current.add(mesh);
            customMeshRef.current = mesh;
            setLoadedCustomName(file.name);
            setCustomMeshError(null);
            fitObjectToView(mesh);

            // Hide procedural model when custom mesh is mounted
            if (modelRef.current) {
              modelRef.current.group.visible = false;
            }

            if (onMeshLoaded) {
              onMeshLoaded(meshInfo, { name: file.name, size: file.size, file, buffer });
            }
          }
        } catch (err) {
          fail(err instanceof Error ? err.message : 'The STL file could not be parsed.');
        }
      }
    };
    reader.onerror = () => fail('The STL file could not be read.');
    reader.readAsArrayBuffer(file);
  };

  const removeCustomMesh = () => {
    if (customMeshRef.current && sceneRef.current) {
      sceneRef.current.remove(customMeshRef.current);
      customMeshRef.current.geometry.dispose();
      (customMeshRef.current.material as THREE.Material).dispose();
      customMeshRef.current = null;
    }
    setLoadedCustomName(null);
    setCustomMeshError(null);
    if (modelRef.current) modelRef.current.group.visible = true;
    onMeshRemoved?.();
    applyCameraPreset('anterior');
  };

  const clearMeasurement = () => {
    measurementGroupRef.current?.clear();
    setMeasurementDistance(null);
  };

  return (
    <div
      ref={containerRef}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) {
          const input = document.createElement('input');
          input.type = 'file';
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          input.files = dataTransfer.files;
          input.onchange = (changeEvent) => handleFileUpload(changeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
          input.click();
        }
      }}
      className={`relative w-full h-full min-h-[540px] bg-slate-50 dark:bg-slate-950 select-none overflow-hidden flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-50' : 'rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs'
      }`}
    >
      {/* 3D WebGL Canvas Mount Container */}
      <div ref={mountRef} className="w-full flex-1 relative cursor-grab active:cursor-grabbing" />

      {/* Top Left: Anatomical Orientation & Preset Badge */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
        <div className="bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-md text-xs backdrop-blur-xs flex items-center gap-2 pointer-events-auto shadow-xs text-slate-800 dark:text-slate-200">
          <span className="text-slate-500 dark:text-slate-400 font-medium">View Preset:</span>
          <span className="text-teal-700 dark:text-cyan-400 font-mono font-semibold capitalize">{activePreset.replace('_', ' ')}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
            {loadedCustomName ? `Custom STL: ${loadedCustomName}` : 'Synthetic Reconstruction (DEMO)'}
          </span>
        </div>

        {/* Hovered Landmark Info Callout */}
        {hoveredLandmark && (
          <div className="bg-white/95 dark:bg-slate-900/95 border border-teal-500/40 dark:border-cyan-500/40 p-2.5 rounded-md text-xs shadow-lg max-w-xs pointer-events-auto">
            <div className="font-semibold text-slate-900 dark:text-slate-100">{hoveredLandmark.name}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              X: {hoveredLandmark.coordinatesMm[0].toFixed(1)} · Y: {hoveredLandmark.coordinatesMm[1].toFixed(1)} · Z:{' '}
              {hoveredLandmark.coordinatesMm[2].toFixed(1)} mm
            </div>
            {hoveredLandmark.validationNotes && (
              <div className="text-[11px] text-teal-700 dark:text-cyan-300/80 mt-1">{hoveredLandmark.validationNotes}</div>
            )}
          </div>
        )}
      </div>

      {/* Top Right: Quick Viewport Utilities */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-1 rounded-md z-10 shadow-xs">
        <label
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors"
          title="Import Patient STL Mesh"
        >
          <Upload className="w-3.5 h-3.5 text-teal-600 dark:text-cyan-400" />
          <span className="font-medium">Import 3D Model</span>
          <input type="file" accept=".stl,.ply,.obj" className="hidden" onChange={handleFileUpload} />
        </label>
        {loadedCustomName && (
          <button
            onClick={removeCustomMesh}
            className="px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
          >
            Remove
          </button>
        )}
        {loadedCustomName && (
          <button
            onClick={() => setMeasureMode((active) => !active)}
            className={`px-2 py-1 text-[11px] rounded ${measureMode ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            {measureMode ? 'Measuring…' : 'Measure'}
          </button>
        )}
        {measurementDistance !== null && (
          <button onClick={clearMeasurement} className="px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
            Clear ({(measurementDistance * (unitScale === 'cm' ? 0.1 : unitScale === 'in' ? 1 / 25.4 : 1)).toFixed(2)} {unitScale === 'unknown' ? 'unverified units' : unitScale})
          </button>
        )}

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

        <button
          onClick={handleResetCamera}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
          title="Reset Camera Target"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen 3D View'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
      {customMeshError && (
        <div className="absolute top-16 right-4 max-w-xs bg-rose-50 dark:bg-rose-950/90 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 rounded-md px-3 py-2 text-xs shadow-lg">
          {customMeshError}
        </div>
      )}
      {measureMode && loadedCustomName && (
        <div className="absolute bottom-20 left-4 bg-slate-900/90 text-cyan-200 rounded-md px-3 py-2 text-xs shadow-lg">
          Click two points on the imported mesh to measure a geometric distance.
        </div>
      )}
      {loadedCustomName && (
        <div className="absolute bottom-20 right-4 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2 text-[11px] text-slate-700 dark:text-slate-300 shadow-lg">
          <label className="flex items-center gap-2">
            <span>Model units:</span>
            <select
              value={unitScale}
              onChange={(event) => {
                const nextUnit = event.target.value as UnitScale;
                setUnitScale(nextUnit);
                onUnitScaleChange?.(nextUnit);
              }}
              className="bg-transparent border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5"
            >
              <option value="unknown">Unverified</option>
              <option value="mm">Millimetres</option>
              <option value="cm">Centimetres</option>
              <option value="in">Inches</option>
            </select>
          </label>
        </div>
      )}

      {/* Unified Bottom Control Dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl z-20 flex flex-col items-center">
        {/* Collapse / Expand Toggle */}
        <button
          onClick={() => setHudCollapsed(!hudCollapsed)}
          className="mb-1 flex items-center gap-1 px-3 py-0.5 text-[11px] font-medium bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-t transition-colors shadow-xs"
        >
          {hudCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>{hudCollapsed ? 'Show 3D Controls' : 'Hide Controls'}</span>
        </button>

        {!hudCollapsed && (
          <div className="w-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 p-2.5 rounded-lg shadow-xl flex flex-col gap-2.5 transition-colors">
            {/* Row 1: Camera Presets & Display Modes */}
            <div className="flex items-center justify-between gap-3 text-xs overflow-x-auto pb-1">
              {/* Presets Segmented Bar */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mr-1">PRESET:</span>
                {(
                  [
                    ['anterior', 'Anterior'],
                    ['posterior', 'Posterior'],
                    ['lateral', 'Lateral (Y-view)'],
                    ['superior', 'Axillary'],
                    ['glenoid_en_face', 'Glenoid En-Face'],
                  ] as [CameraPreset, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => applyCameraPreset(key)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                      activePreset === key
                        ? 'bg-teal-50 dark:bg-cyan-500/20 text-teal-800 dark:text-cyan-300 border border-teal-200 dark:border-cyan-500/40 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Shading Mode Swatches */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mr-1">SHADING:</span>
                {(
                  [
                    ['bone_ivory', 'Bone PBR'],
                    ['wireframe', 'Wireframe'],
                    ['xray', 'X-Ray'],
                    ['normal', 'Normals'],
                  ] as [ShadingMode, string][]
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setShadingMode(mode)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                      shadingMode === mode
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Anatomy Visibility & Joint Distraction Slider */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
              {/* Visibility Toggles */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                  <input
                    type="checkbox"
                    checked={resolvedScapulaVisible}
                    onChange={(e) => {
                      setScapulaVisible(e.target.checked);
                      onVisibilityChange?.({ scapulaVisible: e.target.checked, humerusVisible: resolvedHumerusVisible, landmarksVisible: resolvedShowLandmarks });
                    }}
                    className="rounded border-slate-300 dark:border-slate-700 text-teal-600 dark:text-cyan-500 focus:ring-0"
                  />
                  <span>Scapula</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                  <input
                    type="checkbox"
                    checked={resolvedHumerusVisible}
                    onChange={(e) => {
                      setHumerusVisible(e.target.checked);
                      onVisibilityChange?.({ scapulaVisible: resolvedScapulaVisible, humerusVisible: e.target.checked, landmarksVisible: resolvedShowLandmarks });
                    }}
                    className="rounded border-slate-300 dark:border-slate-700 text-teal-600 dark:text-cyan-500 focus:ring-0"
                  />
                  <span>Humerus</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                  <input
                    type="checkbox"
                    checked={resolvedShowLandmarks}
                    onChange={(e) => {
                      setShowLandmarks(e.target.checked);
                      onVisibilityChange?.({ scapulaVisible: resolvedScapulaVisible, humerusVisible: resolvedHumerusVisible, landmarksVisible: e.target.checked });
                    }}
                    className="rounded border-slate-300 dark:border-slate-700 text-teal-600 dark:text-cyan-500 focus:ring-0"
                  />
                  <MapPin className="w-3 h-3 text-teal-600 dark:text-cyan-400" />
                  <span>Landmarks</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-teal-600 dark:text-cyan-500 focus:ring-0"
                  />
                  <span>Grid</span>
                </label>
              </div>

              {/* Exploded / Joint Distraction Slider */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">JOINT DISTRACTION:</span>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={distractionMm}
                  onChange={(e) => setDistractionMm(Number(e.target.value))}
                  className="w-28 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer"
                />
                <span className="text-[11px] text-teal-700 dark:text-cyan-400 font-mono w-10 tabular-nums font-semibold">
                  {distractionMm.toFixed(0)} mm
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
