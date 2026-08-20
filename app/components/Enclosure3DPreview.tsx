"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type StepMeshPayload = {
  name: string;
  color?: number[];
  position: number[];
  index: number[];
};

type StepModelPayload = {
  meshes: StepMeshPayload[];
};

type PreviewFace = "top" | "bottom" | "front" | "back" | "left" | "right";
type PcbHole = { x: number; y: number };
type PcbPlacement = { x: number; y: number; rotation: number };
type PreviewFeature = {
  id: number;
  kind: "opening" | "connector" | "thermal";
  x: number;
  y: number;
  width?: number;
  height?: number;
  diameter?: number;
  sourceImageName?: string;
};
type ScreenLabelKind = "origin" | "x" | "y";
type ScreenLabel = {
  element: HTMLDivElement;
  anchor: THREE.Vector3;
  kind: ScreenLabelKind;
  source: "origin" | "measurement";
};

const previewFaceLabels: Record<PreviewFace, string> = {
  top: "上面",
  bottom: "下面",
  front: "前面",
  back: "後面",
  left: "左面",
  right: "右面",
};

type Enclosure3DPreviewProps = {
  family: "standard" | "sealed";
  length: number;
  width: number;
  height: number;
  lidHeight: number;
  pcbWidth: number;
  pcbDepth: number;
  pcbHoleDiameter: number;
  pcbHoles: PcbHole[];
  pcbPlacement: PcbPlacement;
  compact?: boolean;
  selectedFace?: PreviewFace;
  activeFeatureId?: number | null;
  features?: Partial<Record<PreviewFace, PreviewFeature[]>>;
};

type CanvasSceneState = {
  baseGroup: THREE.Group;
  lidGroup: THREE.Group;
  pcbGroup: THREE.Group;
  explodedGap: number;
  caseMaterials: Array<{ material: THREE.MeshStandardMaterial; isLid: boolean }>;
  edgeMaterials: THREE.LineBasicMaterial[];
  highlights: Partial<Record<PreviewFace, THREE.Mesh>>;
  markerGroup: THREE.Group;
  originGroup: THREE.Group;
  labelLayer: HTMLDivElement;
  screenLabels: ScreenLabel[];
};

let lightweightModelPromise: Promise<StepModelPayload> | null = null;

function loadLightweightModel() {
  if (!lightweightModelPromise) {
    lightweightModelPromise = fetch("/models/fa01a-lightweight.json").then((response) => {
      if (!response.ok) throw new Error("Unable to load FA01A reference model");
      return response.json() as Promise<StepModelPayload>;
    });
  }
  return lightweightModelPromise;
}

function remapPreservingEnds(value: number, nominal: number, target: number, fixedStart: number, fixedEnd = fixedStart) {
  if (value <= fixedStart) return value;
  if (value >= nominal - fixedEnd) return value + (target - nominal);
  const sourceSpan = nominal - fixedStart - fixedEnd;
  const targetSpan = target - fixedStart - fixedEnd;
  return fixedStart + (value - fixedStart) * (targetSpan / sourceSpan);
}

function getDefaultView(length: number, width: number, height: number, lidHeight: number) {
  const scale = 0.022;
  const halfLength = length * scale * 0.5;
  const halfWidth = width * scale * 0.5;
  const totalHeight = (height + lidHeight) * scale;
  const radius = Math.sqrt(halfLength ** 2 + halfWidth ** 2 + (totalHeight * 0.5) ** 2);
  const distance = Math.max(2.7, (radius / Math.sin(THREE.MathUtils.degToRad(16))) * 0.86);
  const target = new THREE.Vector3(0, totalHeight * 0.45, 0);
  const direction = new THREE.Vector3(1, 0.72, 1.08).normalize();
  return { target, position: target.clone().add(direction.multiplyScalar(distance)), radius };
}

function disposeGroupChildren(group: THREE.Group) {
  group.traverse((object) => {
    if (object === group) return;
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments || object instanceof THREE.Sprite) {
      object.geometry?.dispose();
      const material = object.material as THREE.Material | THREE.Material[];
      (Array.isArray(material) ? material : [material]).forEach((item) => {
        if (item instanceof THREE.SpriteMaterial) item.map?.dispose();
        item.dispose();
      });
    }
  });
  group.clear();
}

function facePoint(face: PreviewFace, x: number, y: number, length: number, width: number, totalHeight: number, scale: number, offset = 0.035) {
  const shellLength = length * scale;
  const shellWidth = width * scale;
  if (face === "top") return new THREE.Vector3(-shellLength / 2 + x * scale, totalHeight + offset, shellWidth / 2 - y * scale);
  if (face === "bottom") return new THREE.Vector3(-shellLength / 2 + x * scale, -offset, -shellWidth / 2 + y * scale);
  if (face === "front") return new THREE.Vector3(-shellLength / 2 + x * scale, y * scale, shellWidth / 2 + offset);
  if (face === "back") return new THREE.Vector3(shellLength / 2 - x * scale, y * scale, -shellWidth / 2 - offset);
  if (face === "right") return new THREE.Vector3(shellLength / 2 + offset, y * scale, shellWidth / 2 - x * scale);
  return new THREE.Vector3(-shellLength / 2 - offset, y * scale, -shellWidth / 2 + x * scale);
}

function getFaceAxes(face: PreviewFace) {
  if (face === "top") return { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1) };
  if (face === "bottom") return { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, 1) };
  if (face === "front") return { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0) };
  if (face === "back") return { x: new THREE.Vector3(-1, 0, 0), y: new THREE.Vector3(0, 1, 0) };
  if (face === "right") return { x: new THREE.Vector3(0, 0, -1), y: new THREE.Vector3(0, 1, 0) };
  return { x: new THREE.Vector3(0, 0, 1), y: new THREE.Vector3(0, 1, 0) };
}

function clearScreenLabels(state: CanvasSceneState, source: ScreenLabel["source"]) {
  state.screenLabels.filter((label) => label.source === source).forEach((label) => label.element.remove());
  state.screenLabels = state.screenLabels.filter((label) => label.source !== source);
}

function addScreenLabel(state: CanvasSceneState, anchor: THREE.Vector3, text: string, color: number, kind: ScreenLabelKind, source: ScreenLabel["source"]) {
  const element = document.createElement("div");
  element.className = `three-measurement-label ${kind}`;
  element.textContent = text;
  element.style.setProperty("--measure-color", `#${color.toString(16).padStart(6, "0")}`);
  state.labelLayer.appendChild(element);
  state.screenLabels.push({ element, anchor: anchor.clone(), kind, source });
}

function layoutScreenLabels(labels: ScreenLabel[], camera: THREE.Camera, width: number, height: number) {
  const placed: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const padding = 8;
  const candidates: Record<ScreenLabelKind, Array<[number, number]>> = {
    x: [[0, -30], [0, 30], [56, -30], [-56, -30], [56, 30], [-56, 30]],
    y: [[48, 0], [-48, 0], [48, -32], [-48, -32], [48, 32], [-48, 32]],
    origin: [[-58, 32], [-58, -32], [58, 32], [58, -32], [0, 42]],
  };

  [...labels].sort((a, b) => Number(a.kind === "origin") - Number(b.kind === "origin")).forEach((label) => {
    const projected = label.anchor.clone().project(camera);
    if (projected.z < -1 || projected.z > 1) {
      label.element.style.display = "none";
      return;
    }
    label.element.style.display = "block";
    const baseX = (projected.x * 0.5 + 0.5) * width;
    const baseY = (-projected.y * 0.5 + 0.5) * height;
    const labelWidth = label.element.offsetWidth || 82;
    const labelHeight = label.element.offsetHeight || 26;
    const halfWidth = labelWidth / 2;
    const halfHeight = labelHeight / 2;
    let best: { x: number; y: number; box: { left: number; top: number; right: number; bottom: number }; score: number } | null = null;

    candidates[label.kind].forEach(([offsetX, offsetY]) => {
      const x = Math.min(width - padding - halfWidth, Math.max(padding + halfWidth, baseX + offsetX));
      const y = Math.min(height - padding - halfHeight, Math.max(padding + halfHeight, baseY + offsetY));
      const box = { left: x - halfWidth, top: y - halfHeight, right: x + halfWidth, bottom: y + halfHeight };
      const overlap = placed.reduce((total, other) => {
        const overlapWidth = Math.max(0, Math.min(box.right, other.right) - Math.max(box.left, other.left) + padding);
        const overlapHeight = Math.max(0, Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) + padding);
        return total + overlapWidth * overlapHeight;
      }, 0);
      const displacement = Math.abs(offsetX) + Math.abs(offsetY);
      const score = overlap * 100 + displacement;
      if (!best || score < best.score) best = { x, y, box, score };
    });

    if (!best) return;
    label.element.style.left = `${best.x}px`;
    label.element.style.top = `${best.y}px`;
    placed.push(best.box);
  });
}

function addMeasurementLine(group: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, sideAxis: THREE.Vector3, color: number) {
  const span = end.clone().sub(start);
  const distance = span.length();
  if (distance < 0.008) return null;
  const direction = span.clone().normalize();
  const material = new THREE.LineBasicMaterial({ color, depthTest: true, depthWrite: true });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), material);
  line.renderOrder = 9;
  group.add(line);

  const arrowLength = Math.min(0.055, distance * 0.22);
  const arrowWidth = arrowLength * 0.48;
  const side = sideAxis.clone().normalize().multiplyScalar(arrowWidth);
  const arrowPoints = [
    start, start.clone().add(direction.clone().multiplyScalar(arrowLength)).add(side),
    start, start.clone().add(direction.clone().multiplyScalar(arrowLength)).sub(side),
    end, end.clone().sub(direction.clone().multiplyScalar(arrowLength)).add(side),
    end, end.clone().sub(direction.clone().multiplyScalar(arrowLength)).sub(side),
  ];
  const arrows = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(arrowPoints), material.clone());
  arrows.renderOrder = 9;
  group.add(arrows);
  return start.clone().lerp(end, 0.5).add(sideAxis.clone().normalize().multiplyScalar(0.025));
}

function EnclosureCanvas({ length, width, height, lidHeight, pcbWidth, pcbDepth, pcbHoleDiameter, pcbHoles, pcbPlacement, family, exploded, transparent, resetToken, selectedFace, activeFeatureId, features, showLid, showBody, showPcb }: Omit<Enclosure3DPreviewProps, "compact"> & { exploded: boolean; transparent: boolean; resetToken: number; showLid: boolean; showBody: boolean; showPcb: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);
  const viewRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const sceneStateRef = useRef<CanvasSceneState | null>(null);
  const visualStateRef = useRef({ exploded, transparent, selectedFace, showLid, showBody, showPcb });
  visualStateRef.current = { exploded, transparent, selectedFace, showLid, showBody, showPcb };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const defaultView = getDefaultView(length, width, height, lidHeight);
    camera.position.copy(viewRef.current?.position ?? defaultView.position);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    const labelLayer = document.createElement("div");
    labelLayer.className = "three-measurement-layer";
    mount.appendChild(labelLayer);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = Math.max(1.65, defaultView.radius * 1.2);
    controls.maxDistance = Math.max(11, defaultView.radius * 8);
    controls.target.copy(viewRef.current?.target ?? defaultView.target);
    const handleOrbitStart = () => labelLayer.classList.add("is-orbiting");
    const handleOrbitEnd = () => labelLayer.classList.remove("is-orbiting");
    controls.addEventListener("start", handleOrbitStart);
    controls.addEventListener("end", handleOrbitEnd);
    stateRef.current = { camera, controls };

    scene.add(new THREE.HemisphereLight(0xffffff, 0x85968c, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fc2a4, 1.1);
    fill.position.set(-5, 2, -4);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.ShadowMaterial({ color: 0x173524, opacity: 0.12 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(12, 24, 0xa8b9af, 0xd3ddd7);
    grid.position.y = -0.045;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    scene.add(grid);

    const enclosure = new THREE.Group();
    scene.add(enclosure);
    const baseGroup = new THREE.Group();
    const lidGroup = new THREE.Group();
    const pcbGroup = new THREE.Group();
    const markerGroup = new THREE.Group();
    const originGroup = new THREE.Group();
    enclosure.add(baseGroup, lidGroup, pcbGroup, markerGroup, originGroup);
    baseGroup.visible = showBody;
    lidGroup.visible = showLid;
    pcbGroup.visible = showPcb;
    let disposed = false;

    const scale = 0.022;
    const explodedGap = Math.max(18, height * 0.55) * scale;
    lidGroup.position.y = exploded ? explodedGap : 0;
    lidGroup.rotation.y = exploded ? -0.035 : 0;
    const canvasSceneState: CanvasSceneState = { baseGroup, lidGroup, pcbGroup, markerGroup, originGroup, labelLayer, screenLabels: [], explodedGap, caseMaterials: [], edgeMaterials: [], highlights: {} };
    sceneStateRef.current = canvasSceneState;

    const pcbLengthWorld = Math.max(1, pcbWidth) * scale;
    const pcbDepthWorld = Math.max(1, pcbDepth) * scale;
    const pcbMaterial = new THREE.MeshStandardMaterial({ color: 0x176b46, roughness: 0.62, metalness: 0.02 });
    const pcbBoard = new THREE.Mesh(new THREE.BoxGeometry(pcbLengthWorld, 0.055, pcbDepthWorld), pcbMaterial);
    const pcbElevation = Math.min(height * scale * 0.38, 0.18);
    pcbBoard.position.set(pcbLengthWorld / 2, 0, -pcbDepthWorld / 2);
    pcbBoard.castShadow = true;
    pcbBoard.receiveShadow = true;
    pcbGroup.add(pcbBoard);
    pcbGroup.position.set((-length / 2 + pcbPlacement.x) * scale, pcbElevation, (width / 2 - pcbPlacement.y) * scale);
    pcbGroup.rotation.y = THREE.MathUtils.degToRad(pcbPlacement.rotation);

    const holeMaterial = new THREE.MeshBasicMaterial({ color: 0xdce8df, side: THREE.DoubleSide });
    const holeRadius = Math.max(0.018, pcbHoleDiameter * scale * 0.5);
    pcbHoles.forEach((pcbHole) => {
      const hole = new THREE.Mesh(new THREE.RingGeometry(holeRadius * 0.48, holeRadius, 24), holeMaterial);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(pcbHole.x * scale, 0.031, -pcbHole.y * scale);
      pcbGroup.add(hole);
    });

    const totalHeight = Math.max(0.18, (height + lidHeight) * scale);
    const bodyHeight = Math.max(0.18, height * scale);
    const shellLength = length * scale;
    const shellWidth = width * scale;
    (Object.keys(previewFaceLabels) as PreviewFace[]).forEach((face) => {
      const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xb9ef5f, transparent: true, opacity: 0.34, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
      let geometry: THREE.BoxGeometry;
      const highlight = new THREE.Mesh();

      if (face === "top" || face === "bottom") {
        geometry = new THREE.BoxGeometry(shellLength * 0.94, 0.018, shellWidth * 0.94);
        highlight.position.y = face === "top" ? totalHeight + 0.025 : 0.01;
      } else if (face === "front" || face === "back") {
        geometry = new THREE.BoxGeometry(shellLength * 0.94, bodyHeight * 0.9, 0.018);
        highlight.position.set(0, bodyHeight / 2, face === "front" ? shellWidth / 2 + 0.025 : -shellWidth / 2 - 0.025);
      } else {
        geometry = new THREE.BoxGeometry(0.018, bodyHeight * 0.9, shellWidth * 0.94);
        highlight.position.set(face === "right" ? shellLength / 2 + 0.025 : -shellLength / 2 - 0.025, bodyHeight / 2, 0);
      }

      highlight.geometry = geometry;
      highlight.material = highlightMaterial;
      highlight.renderOrder = 20;
      highlight.visible = face === selectedFace;
      enclosure.add(highlight);
      canvasSceneState.highlights[face] = highlight;
    });

    loadLightweightModel().then((model) => {
      if (disposed) return;

      model.meshes.forEach((source, meshIndex) => {
        const isLid = meshIndex === 1;
        const transformed = new Float32Array(source.position.length);

        for (let index = 0; index < source.position.length; index += 3) {
          const sourceX = source.position[index];
          const sourceY = source.position[index + 1];
          const sourceZ = source.position[index + 2];
          const mappedX = remapPreservingEnds(sourceX, 60, length, 10, 10);
          const mappedDepth = remapPreservingEnds(sourceY, 50, width, 10, 10);
          let mappedHeight: number;

          if (isLid) {
            mappedHeight = height - 0.8
              + remapPreservingEnds(sourceZ - 20, 8, lidHeight, 2.4, 2.4);
          } else {
            mappedHeight = remapPreservingEnds(sourceZ, 20.8, height, 2.4, 0.8);
          }

          transformed[index] = (mappedX - length / 2) * scale;
          transformed[index + 1] = mappedHeight * scale;
          transformed[index + 2] = -(mappedDepth - width / 2) * scale;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(transformed, 3));
        geometry.setIndex(source.index);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
          color: family === "sealed" ? (isLid ? 0x808b85 : 0x56665d) : (isLid ? 0xd4ddd7 : 0xaebdb4),
          roughness: isLid ? 0.45 : 0.53,
          metalness: family === "sealed" ? 0.18 : 0.04,
          transparent: visualStateRef.current.transparent,
          opacity: visualStateRef.current.transparent ? (isLid ? 0.31 : 0.25) : 1,
          depthWrite: !visualStateRef.current.transparent,
          side: visualStateRef.current.transparent ? THREE.DoubleSide : THREE.FrontSide,
        });
        canvasSceneState.caseMaterials.push({ material, isLid });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = source.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x34483c, transparent: true, opacity: visualStateRef.current.transparent ? 0.58 : 0.36 });
        canvasSceneState.edgeMaterials.push(edgeMaterial);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), edgeMaterial);
        mesh.add(edges);
        (isLid ? lidGroup : baseGroup).add(mesh);
      });
    }).catch((error) => console.error("Failed to load FA01A model", error));

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(rect.height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      layoutScreenLabels(canvasSceneState.screenLabels, camera, mount.clientWidth, mount.clientHeight);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      viewRef.current = { position: camera.position.clone(), target: controls.target.clone() };
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("start", handleOrbitStart);
      controls.removeEventListener("end", handleOrbitEnd);
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
          object.geometry?.dispose();
          const material = object.material as THREE.Material | THREE.Material[];
          (Array.isArray(material) ? material : [material]).forEach((item) => item.dispose());
        }
      });
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      canvasSceneState.screenLabels.forEach((label) => label.element.remove());
      if (labelLayer.parentElement === mount) mount.removeChild(labelLayer);
      stateRef.current = null;
      if (sceneStateRef.current === canvasSceneState) sceneStateRef.current = null;
    };
  }, [family, height, length, lidHeight, pcbDepth, pcbHoleDiameter, pcbHoles, pcbPlacement, pcbWidth, width]);

  useEffect(() => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) return;
    sceneState.baseGroup.visible = showBody;
    sceneState.lidGroup.visible = showLid;
    sceneState.pcbGroup.visible = showPcb;
  }, [showBody, showLid, showPcb]);

  useEffect(() => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) return;
    sceneState.lidGroup.position.y = exploded ? sceneState.explodedGap : 0;
    sceneState.lidGroup.rotation.y = exploded ? -0.035 : 0;
  }, [exploded]);

  useEffect(() => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) return;
    sceneState.caseMaterials.forEach(({ material, isLid }) => {
      material.transparent = transparent;
      material.opacity = transparent ? (isLid ? 0.31 : 0.25) : 1;
      material.depthWrite = !transparent;
      material.side = transparent ? THREE.DoubleSide : THREE.FrontSide;
      material.needsUpdate = true;
    });
    sceneState.edgeMaterials.forEach((material) => { material.opacity = transparent ? 0.58 : 0.36; });
  }, [transparent]);

  useEffect(() => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) return;
    (Object.entries(sceneState.highlights) as [PreviewFace, THREE.Mesh][]).forEach(([face, mesh]) => { mesh.visible = face === selectedFace; });
    disposeGroupChildren(sceneState.originGroup);
    clearScreenLabels(sceneState, "origin");
    if (!selectedFace) return;
    const scale = 0.022;
    const totalHeight = Math.max(0.18, (height + lidHeight) * scale);
    const { x: xAxis, y: yAxis } = getFaceAxes(selectedFace);
    const axisLength = Math.max(0.15, Math.min(length * scale, width * scale, totalHeight) * 0.2);
    const origin = facePoint(selectedFace, 0, 0, length, width, totalHeight, scale, 0.045);
    const red = new THREE.LineBasicMaterial({ color: 0xd64137, depthTest: true, depthWrite: true });
    const makeAxis = (direction: THREE.Vector3) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), direction.clone().multiplyScalar(axisLength)]);
      return new THREE.Line(geometry, red.clone());
    };
    const axes = new THREE.Group();
    axes.position.copy(origin);
    axes.add(makeAxis(xAxis), makeAxis(yAxis));
    const originDot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 18, 14), new THREE.MeshStandardMaterial({ color: 0xe64a3e, roughness: 0.45, depthTest: true }));
    axes.add(originDot);
    addScreenLabel(sceneState, origin, "X0 / Y0", 0xc9473f, "origin", "origin");
    sceneState.originGroup.add(axes);
  }, [height, length, lidHeight, selectedFace, width]);

  useEffect(() => {
    const sceneState = sceneStateRef.current;
    if (!sceneState) return;
    disposeGroupChildren(sceneState.markerGroup);
    clearScreenLabels(sceneState, "measurement");
    const scale = 0.022;
    const totalHeight = Math.max(0.18, (height + lidHeight) * scale);
    (Object.entries(features ?? {}) as [PreviewFace, PreviewFeature[]][]).forEach(([face, items]) => {
      items.forEach((item, index) => {
        const axes = getFaceAxes(face);
        if ((item.kind === "opening" && !item.sourceImageName) || item.kind === "connector") {
          const outlineColor = item.kind === "connector" ? 0x1582c4 : 0xd84a3f;
          const outlineMaterial = new THREE.LineBasicMaterial({ color: outlineColor, depthTest: true, depthWrite: true });
          const diameter = item.diameter;
          const featureWidth = diameter ?? Math.max(2, item.width ?? 10);
          const featureHeight = diameter ?? Math.max(2, item.height ?? 8);
          const center = facePoint(face, item.x + featureWidth / 2, item.y + featureHeight / 2, length, width, totalHeight, scale, 0.068 + index * 0.001);
          const points: THREE.Vector3[] = [];
          if (diameter) {
            for (let pointIndex = 0; pointIndex < 48; pointIndex += 1) {
              const angle = (pointIndex / 48) * Math.PI * 2;
              points.push(center.clone().add(axes.x.clone().multiplyScalar(Math.cos(angle) * diameter * scale * 0.5)).add(axes.y.clone().multiplyScalar(Math.sin(angle) * diameter * scale * 0.5)));
            }
          } else {
            const halfWidth = Math.max(2, item.width ?? 10) * scale * 0.5;
            const halfHeight = Math.max(2, item.height ?? 8) * scale * 0.5;
            [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([xSign, ySign]) => points.push(center.clone().add(axes.x.clone().multiplyScalar(xSign * halfWidth)).add(axes.y.clone().multiplyScalar(ySign * halfHeight))));
          }
          const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), outlineMaterial);
          outline.renderOrder = 8;
          sceneState.markerGroup.add(outline);
          if (item.kind === "connector") {
            const centerMarker = new THREE.Mesh(new THREE.SphereGeometry(0.027, 16, 12), new THREE.MeshBasicMaterial({ color: outlineColor, depthTest: true, depthWrite: true }));
            centerMarker.position.copy(center);
            sceneState.markerGroup.add(centerMarker);
          }
          if (face === selectedFace && item.id === activeFeatureId) {
            const measureOffset = 0.075 + index * 0.002;
            const corner = facePoint(face, item.x, item.y, length, width, totalHeight, scale, measureOffset);
            const xStart = facePoint(face, 0, item.y, length, width, totalHeight, scale, measureOffset);
            const yStart = facePoint(face, item.x, 0, length, width, totalHeight, scale, measureOffset);
            const xLabelAnchor = addMeasurementLine(sceneState.markerGroup, xStart, corner, axes.y, outlineColor);
            const yLabelAnchor = addMeasurementLine(sceneState.markerGroup, yStart, corner, axes.x, outlineColor);
            if (xLabelAnchor) addScreenLabel(sceneState, xLabelAnchor, `X ${item.x} mm`, outlineColor, "x", "measurement");
            if (yLabelAnchor) addScreenLabel(sceneState, yLabelAnchor, `Y ${item.y} mm`, outlineColor, "y", "measurement");
          }
        } else {
          const center = facePoint(face, item.x, item.y, length, width, totalHeight, scale, 0.068 + index * 0.001);
          const marker = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 16), new THREE.MeshStandardMaterial({ color: item.kind === "thermal" ? 0xe06037 : 0xb4df42, roughness: 0.32, metalness: 0.08, depthTest: true, depthWrite: true }));
          marker.position.copy(center);
          marker.castShadow = true;
          sceneState.markerGroup.add(marker);
        }
      });
    });
  }, [activeFeatureId, features, height, length, lidHeight, selectedFace, width]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const defaultView = getDefaultView(length, width, height, lidHeight);
    state.camera.position.copy(defaultView.position);
    state.controls.target.copy(defaultView.target);
    state.controls.update();
  }, [height, length, lidHeight, resetToken, width]);

  return <div className="enclosure-three-mount" ref={mountRef} aria-label="可拖曳旋轉的 FA01A 外殼三維預覽" />;
}

export function Enclosure3DPreview({ family, length, width, height, lidHeight, pcbWidth, pcbDepth, pcbHoleDiameter, pcbHoles, pcbPlacement, compact = false, selectedFace, activeFeatureId, features = {} }: Enclosure3DPreviewProps) {
  const [exploded, setExploded] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [showLid, setShowLid] = useState(true);
  const [showBody, setShowBody] = useState(true);
  const [showPcb, setShowPcb] = useState(true);

  return (
    <section className={`enclosure-three-preview ${compact ? "compact" : ""}`}>
      <div className="enclosure-three-head">
        <div><span>即時 3D 預覽</span><strong>{family === "sealed" ? "密封型外殼示意" : "輕量型外殼"}</strong></div>
        <div className="enclosure-three-controls">
          <div className="enclosure-layer-actions" role="group" aria-label="3D 零件顯示">
            <button type="button" className={showLid ? "active" : ""} aria-pressed={showLid} onClick={() => setShowLid((value) => !value)}><i />上蓋</button>
            <button type="button" className={showPcb ? "active" : ""} aria-pressed={showPcb} onClick={() => setShowPcb((value) => !value)}><i />PCB</button>
            <button type="button" className={showBody ? "active" : ""} aria-pressed={showBody} onClick={() => setShowBody((value) => !value)}><i />本體</button>
          </div>
          <div className="enclosure-three-actions">
            <button type="button" className={transparent ? "active" : ""} aria-pressed={transparent} onClick={() => setTransparent((value) => !value)}>{transparent ? "實體" : "透視"}</button>
            <button type="button" className={exploded ? "active" : ""} aria-pressed={exploded} onClick={() => setExploded((value) => !value)}>爆炸圖</button>
            <button type="button" aria-label="重設 3D 視角" onClick={() => setResetToken((value) => value + 1)}>↻</button>
          </div>
        </div>
      </div>
      <div className="enclosure-three-stage">
        <EnclosureCanvas family={family} length={length} width={width} height={height} lidHeight={lidHeight} pcbWidth={pcbWidth} pcbDepth={pcbDepth} pcbHoleDiameter={pcbHoleDiameter} pcbHoles={pcbHoles} pcbPlacement={pcbPlacement} exploded={exploded} transparent={transparent} resetToken={resetToken} selectedFace={selectedFace} activeFeatureId={activeFeatureId} features={features} showLid={showLid} showBody={showBody} showPcb={showPcb} />
        <span className="three-drag-hint">拖曳旋轉 · 滾輪縮放</span>
        {family === "sealed" && <span className="three-family-note">密封結構尚未完成，目前沿用 FA01A 視覺替身</span>}
      </div>
      <div className="enclosure-three-specs">
        <span data-engineering-key="CASE_L"><small>外殼長度</small><b>{length} mm</b></span>
        <span data-engineering-key="CASE_W"><small>外殼寬度</small><b>{width} mm</b></span>
        <span data-engineering-key="CASE_H"><small>本體高度</small><b>{height} mm</b></span>
        <span data-engineering-key="LID_H"><small>上蓋高度</small><b>{lidHeight} mm</b></span>
        <span><small>固定結構</small><b>壁厚 2.4 mm · 圓角 R4.5</b></span>
      </div>
    </section>
  );
}
