/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildProceduralShoulder, ProceduralShoulderModel } from './ProceduralAnatomy';
import { LandmarkMarkersManager } from './LandmarkMarkers';
import { parseSTLArrayBuffer, LoadedMeshResult } from './STLLoaderUtil';
import { AnatomicalLandmark } from '../../types/case';
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

interface ShoulderSceneProps {
  landmarks?: AnatomicalLandmark[];
  showImplants?: boolean;
  activeLandmarkId?: string | null;
  onSelectLandmark?: (landmark: AnatomicalLandmark | null) => void;
  customStlBuffer?: ArrayBuffer | null;
  onMeshLoaded?: (meshInfo: LoadedMeshResult) => void;
}

export const ShoulderScene: React.FC<ShoulderSceneProps> = ({
  landmarks = [],
  showImplants = false,
  activeLandmarkId = null,
  onSelectLandmark,
  customStlBuffer = null,
  onMeshLoaded,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Model refs
  const modelRef = useRef<ProceduralShoulderModel | null>(null);
  const customMeshRef = useRef<THREE.Mesh | null>(null);
  const landmarksManagerRef = useRef<LandmarkMarkersManager | null>(null);
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

  const containerRef = useRef<HTMLDivElement>(null);

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
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

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
      landmarksManagerRef.current.updateLandmarks(landmarks);
      landmarksManagerRef.current.setVisible(showLandmarks);
    }
  }, [landmarks, showLandmarks]);

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
      modelRef.current.scapulaGroup.visible = scapulaVisible;
      modelRef.current.humerusGroup.visible = humerusVisible;
      modelRef.current.materials.cartilage.visible = cartilageVisible;
    }
  }, [scapulaVisible, humerusVisible, cartilageVisible]);

  // Update Helpers
  useEffect(() => {
    if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
    if (axesHelperRef.current) axesHelperRef.current.visible = showAxes;
  }, [showGrid, showAxes]);

  // Update Shading Modes
  useEffect(() => {
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
  }, [shadingMode]);

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
    applyCameraPreset('anterior');
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

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (buffer) {
        try {
          const meshInfo = parseSTLArrayBuffer(buffer);
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

            // Center geometry and scale appropriately if needed
            meshInfo.geometry.center();
            mesh.position.set(0, 0, 0);

            sceneRef.current.add(mesh);
            customMeshRef.current = mesh;
            setLoadedCustomName(file.name);

            // Hide procedural model when custom mesh is mounted
            if (modelRef.current) {
              modelRef.current.group.visible = false;
            }

            if (onMeshLoaded) {
              onMeshLoaded(meshInfo);
            }
          }
        } catch (err) {
          console.error('Failed to parse STL', err);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div
      ref={containerRef}
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
          <span className="font-medium">Import STL</span>
          <input type="file" accept=".stl" className="hidden" onChange={handleFileUpload} />
        </label>

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
                    checked={scapulaVisible}
                    onChange={(e) => setScapulaVisible(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-teal-600 dark:text-cyan-500 focus:ring-0"
                  />
                  <span>Scapula</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                  <input
                    type="checkbox"
                    checked={humerusVisible}
                    onChange={(e) => setHumerusVisible(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-teal-600 dark:text-cyan-500 focus:ring-0"
                  />
                  <span>Humerus</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                  <input
                    type="checkbox"
                    checked={showLandmarks}
                    onChange={(e) => setShowLandmarks(e.target.checked)}
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
