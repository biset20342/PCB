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
  compact?: boolean;
  selectedFace?: PreviewFace;
  featureCounts?: Partial<Record<PreviewFace, number>>;
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

function EnclosureCanvas({ length, width, height, lidHeight, family, exploded, transparent, resetToken, selectedFace, showLid, showBody, showPcb }: Omit<Enclosure3DPreviewProps, "compact" | "featureCounts"> & { exploded: boolean; transparent: boolean; resetToken: number; showLid: boolean; showBody: boolean; showPcb: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(4.8, 3.7, 5.7);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 3.7;
    controls.maxDistance = 11;
    controls.target.set(0, Math.max(0.55, (height + lidHeight) * 0.011), 0);
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
    enclosure.add(baseGroup, lidGroup, pcbGroup);
    baseGroup.visible = showBody;
    lidGroup.visible = showLid;
    pcbGroup.visible = showPcb;
    let disposed = false;

    const scale = 0.022;
    const explodedGap = exploded ? Math.max(18, height * 0.55) : 0;
    lidGroup.rotation.y = exploded ? -0.035 : 0;

    const pcbLength = Math.max(24, length - 18) * scale;
    const pcbWidth = Math.max(24, width - 18) * scale;
    const pcbMaterial = new THREE.MeshStandardMaterial({ color: 0x176b46, roughness: 0.62, metalness: 0.02 });
    const pcbBoard = new THREE.Mesh(new THREE.BoxGeometry(pcbLength, 0.055, pcbWidth), pcbMaterial);
    pcbBoard.position.y = Math.min(height * scale * 0.38, 0.18);
    pcbBoard.castShadow = true;
    pcbBoard.receiveShadow = true;
    pcbGroup.add(pcbBoard);

    const holeMaterial = new THREE.MeshBasicMaterial({ color: 0xdce8df, side: THREE.DoubleSide });
    const holeOffsetX = pcbLength / 2 - 0.09;
    const holeOffsetZ = pcbWidth / 2 - 0.09;
    [[-holeOffsetX, -holeOffsetZ], [holeOffsetX, -holeOffsetZ], [-holeOffsetX, holeOffsetZ], [holeOffsetX, holeOffsetZ]].forEach(([x, z]) => {
      const hole = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.041, 20), holeMaterial);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(x, pcbBoard.position.y + 0.031, z);
      pcbGroup.add(hole);
    });

    if (selectedFace) {
      const totalHeight = Math.max(0.18, (height + lidHeight) * scale);
      const shellLength = length * scale;
      const shellWidth = width * scale;
      const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xb9ef5f, transparent: true, opacity: 0.34, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
      let geometry: THREE.BoxGeometry;
      const highlight = new THREE.Mesh();

      if (selectedFace === "top" || selectedFace === "bottom") {
        geometry = new THREE.BoxGeometry(shellLength * 0.94, 0.018, shellWidth * 0.94);
        highlight.position.y = selectedFace === "top" ? totalHeight + 0.025 : 0.01;
      } else if (selectedFace === "front" || selectedFace === "back") {
        geometry = new THREE.BoxGeometry(shellLength * 0.94, totalHeight * 0.88, 0.018);
        highlight.position.set(0, totalHeight / 2, selectedFace === "front" ? shellWidth / 2 + 0.025 : -shellWidth / 2 - 0.025);
      } else {
        geometry = new THREE.BoxGeometry(0.018, totalHeight * 0.88, shellWidth * 0.94);
        highlight.position.set(selectedFace === "right" ? shellLength / 2 + 0.025 : -shellLength / 2 - 0.025, totalHeight / 2, 0);
      }

      highlight.geometry = geometry;
      highlight.material = highlightMaterial;
      highlight.renderOrder = 20;
      enclosure.add(highlight);
    }

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
              + remapPreservingEnds(sourceZ - 20, 8, lidHeight, 2.4, 2.4)
              + explodedGap;
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
          transparent,
          opacity: transparent ? (isLid ? 0.31 : 0.25) : 1,
          depthWrite: !transparent,
          side: transparent ? THREE.DoubleSide : THREE.FrontSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = source.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 28),
          new THREE.LineBasicMaterial({ color: 0x34483c, transparent: true, opacity: transparent ? 0.58 : 0.36 }),
        );
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
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
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
      stateRef.current = null;
    };
  }, [exploded, family, height, length, lidHeight, selectedFace, showBody, showLid, showPcb, transparent, width]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.camera.position.set(4.8, 3.7, 5.7);
    state.controls.target.set(0, Math.max(0.55, (height + lidHeight) * 0.011), 0);
    state.controls.update();
  }, [height, lidHeight, resetToken]);

  return <div className="enclosure-three-mount" ref={mountRef} aria-label="可拖曳旋轉的 FA01A 外殼三維預覽" />;
}

export function Enclosure3DPreview({ family, length, width, height, lidHeight, compact = false, selectedFace, featureCounts = {} }: Enclosure3DPreviewProps) {
  const [exploded, setExploded] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [showLid, setShowLid] = useState(true);
  const [showBody, setShowBody] = useState(true);
  const [showPcb, setShowPcb] = useState(true);
  const callouts = (Object.entries(featureCounts) as [PreviewFace, number][]).filter(([, count]) => count > 0);

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
        <EnclosureCanvas family={family} length={length} width={width} height={height} lidHeight={lidHeight} exploded={exploded} transparent={transparent} resetToken={resetToken} selectedFace={selectedFace} showLid={showLid} showBody={showBody} showPcb={showPcb} />
        {callouts.map(([face, count]) => <span className={`three-feature-callout face-${face}`} key={face}><b>{previewFaceLabels[face]}</b>{count} 項客製</span>)}
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
