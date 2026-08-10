"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Box,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Info,
  Maximize2,
  RotateCcw,
  Sparkles,
} from "lucide-react";

type LidType = "SCREW" | "SNAP";
type SealType = "NONE" | "GASKET";
type CaseFamily = "LIGHTWEIGHT" | "SEALED";

type Config = {
  family: CaseFamily;
  length: number;
  width: number;
  height: number;
  lidHeight: number;
  wall: number;
  screwThickness: number;
  cornerRadius: number;
  lid: LidType;
  seal: SealType;
};

const FAMILY_PRESETS: Record<CaseFamily, Pick<Config, "length" | "width" | "height" | "lidHeight" | "wall" | "screwThickness" | "cornerRadius">> = {
  LIGHTWEIGHT: { length: 80, width: 60, height: 30, lidHeight: 12, wall: 2.4, screwThickness: 2.4, cornerRadius: 4.5 },
  SEALED: { length: 80, width: 60, height: 36, lidHeight: 14, wall: 3.0, screwThickness: 3.0, cornerRadius: 6 },
};

const FAMILY_LABELS: Record<CaseFamily, { name: string; note: string }> = {
  LIGHTWEIGHT: { name: "輕量型", note: "薄壁、螺絲固定，適合一般室內設備" },
  SEALED: { name: "密封型", note: "整合密封結構，設計規格準備中" },
};

const initialConfig: Config = {
  family: "LIGHTWEIGHT",
  ...FAMILY_PRESETS.LIGHTWEIGHT,
  lid: "SCREW",
  seal: "NONE",
};

function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const safeUpdate = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <div className="number-control">
      <div className="control-heading">
        <label>{label}</label>
        <div className="number-input-wrap">
          <input
            aria-label={`${label}，單位毫米`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => safeUpdate(Number(event.target.value) || min)}
          />
          <span>mm</span>
        </div>
      </div>
      <input
        aria-label={`${label}滑桿`}
        className="range-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => safeUpdate(Number(event.target.value))}
      />
      <div className="range-bounds"><span>{min}</span><span>{max}</span></div>
    </div>
  );
}

function addEdges(mesh: THREE.Mesh, color = 0x6f7882) {
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.42 }),
  );
  mesh.add(lines);
}

function createBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  edges = true,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (edges) addEdges(mesh);
  group.add(mesh);
  return mesh;
}

function EnclosureCanvas({
  config,
  exploded,
  transparent,
  resetToken,
}: {
  config: Config;
  exploded: boolean;
  transparent: boolean;
  resetToken: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(4.8, 3.6, 5.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 10;
    controls.target.set(0, 0.55, 0);
    stateRef.current = { camera, controls };

    const hemi = new THREE.HemisphereLight(0xffffff, 0x9ca3a9, 2.2);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 3.3);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fb8ff, 1.2);
    fill.position.set(-5, 2, -4);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.ShadowMaterial({ color: 0x202b36, opacity: 0.13 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(12, 24, 0xb8c0c7, 0xdce1e5);
    grid.position.y = -0.045;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.34;
    scene.add(grid);

    const enclosure = new THREE.Group();
    scene.add(enclosure);

    const scale = 0.022;
    const l = config.length * scale;
    const w = config.width * scale;
    const h = config.height * scale;
    const lidH = config.lidHeight * scale;
    const t = Math.max(config.wall * scale, 0.04);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f4851,
      roughness: 0.56,
      metalness: 0.03,
      transparent,
      opacity: transparent ? 0.34 : 1,
      side: THREE.DoubleSide,
    });
    const lidMaterial = new THREE.MeshStandardMaterial({
      color: 0x56616b,
      roughness: 0.48,
      metalness: 0.04,
      transparent,
      opacity: transparent ? 0.48 : 1,
    });
    const pcbMaterial = new THREE.MeshStandardMaterial({ color: 0x157c65, roughness: 0.55 });
    const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb8c0, roughness: 0.28, metalness: 0.72 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x151c22, roughness: 0.42 });

    createBox(enclosure, [l, t, w], [0, t / 2, 0], baseMaterial);
    createBox(enclosure, [l, h, t], [0, h / 2, -w / 2 + t / 2], baseMaterial);
    createBox(enclosure, [l, h, t], [0, h / 2, w / 2 - t / 2], baseMaterial);
    createBox(enclosure, [t, h, Math.max(w - 2 * t, t)], [-l / 2 + t / 2, h / 2, 0], baseMaterial);
    createBox(enclosure, [t, h, Math.max(w - 2 * t, t)], [l / 2 - t / 2, h / 2, 0], baseMaterial);

    const pcbL = Math.max(l - 7 * t, l * 0.58);
    const pcbW = Math.max(w - 7 * t, w * 0.54);
    const pcbY = t + 0.13;
    createBox(enclosure, [pcbL, 0.055, pcbW], [0, pcbY, 0], pcbMaterial);

    const bossPositions: [number, number][] = [
      [-pcbL / 2 + 0.14, -pcbW / 2 + 0.14],
      [pcbL / 2 - 0.14, -pcbW / 2 + 0.14],
      [-pcbL / 2 + 0.14, pcbW / 2 - 0.14],
      [pcbL / 2 - 0.14, pcbW / 2 - 0.14],
    ];
    bossPositions.forEach(([x, z]) => {
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.15, 20), baseMaterial);
      boss.position.set(x, t + 0.075, z);
      boss.castShadow = true;
      enclosure.add(boss);
    });

    createBox(enclosure, [0.28, 0.18, 0.22], [pcbL * 0.17, pcbY + 0.11, 0.04], darkMaterial, false);
    createBox(enclosure, [0.34, 0.13, 0.18], [-pcbL * 0.19, pcbY + 0.085, -pcbW * 0.18], darkMaterial, false);
    createBox(enclosure, [0.34, 0.22, 0.23], [pcbL / 2 - 0.08, pcbY + 0.13, 0.14], metalMaterial);
    createBox(enclosure, [0.46, 0.31, 0.36], [pcbL / 2 - 0.09, pcbY + 0.18, -0.25], darkMaterial);

    const lidBaseY = h + (exploded ? Math.max(0.65, h * 0.62) : 0);
    const lidY = lidBaseY + lidH - t / 2;
    const lid = createBox(enclosure, [l + t * 0.18, t, w + t * 0.18], [0, lidY, 0], lidMaterial);
    lid.rotation.y = exploded ? -0.04 : 0;
    const lidWallH = Math.max(lidH - t, t);
    const lidWallY = lidBaseY + lidWallH / 2;
    createBox(enclosure, [l, lidWallH, t], [0, lidWallY, -w / 2 + t / 2], lidMaterial);
    createBox(enclosure, [l, lidWallH, t], [0, lidWallY, w / 2 - t / 2], lidMaterial);
    createBox(enclosure, [t, lidWallH, Math.max(w - 2 * t, t)], [-l / 2 + t / 2, lidWallY, 0], lidMaterial);
    createBox(enclosure, [t, lidWallH, Math.max(w - 2 * t, t)], [l / 2 - t / 2, lidWallY, 0], lidMaterial);

    const screwMat = new THREE.MeshStandardMaterial({ color: 0x1b232a, roughness: 0.24, metalness: 0.65 });
    const inset = Math.max(2.2 * t, 0.15);
    [[-l / 2 + inset, -w / 2 + inset], [l / 2 - inset, -w / 2 + inset], [-l / 2 + inset, w / 2 - inset], [l / 2 - inset, w / 2 - inset]].forEach(([x, z]) => {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, t * 1.25, 24), screwMat);
      screw.position.set(x, lidY + t * 0.38, z);
      enclosure.add(screw);
    });

    const dimensionMaterial = new THREE.LineBasicMaterial({ color: 0x2d63d6, transparent: true, opacity: 0.78 });
    const makeMeasure = (points: THREE.Vector3[]) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      enclosure.add(new THREE.Line(geometry, dimensionMaterial));
    };
    makeMeasure([new THREE.Vector3(-l / 2, -0.01, w / 2 + 0.26), new THREE.Vector3(l / 2, -0.01, w / 2 + 0.26)]);
    makeMeasure([new THREE.Vector3(l / 2 + 0.26, -0.01, -w / 2), new THREE.Vector3(l / 2 + 0.26, -0.01, w / 2)]);
    makeMeasure([new THREE.Vector3(-l / 2 - 0.22, 0, -w / 2), new THREE.Vector3(-l / 2 - 0.22, h + lidH, -w / 2)]);

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
      mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [config, exploded, transparent]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.camera.position.set(4.8, 3.6, 5.6);
    state.controls.target.set(0, 0.55, 0);
    state.controls.update();
  }, [resetToken]);

  return <div className="three-mount" ref={mountRef} aria-label="可拖曳旋轉的外殼三維預覽" />;
}

export function EnclosureConfigurator() {
  const [config, setConfig] = useState<Config>(initialConfig);
  const [exploded, setExploded] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [copied, setCopied] = useState(false);

  const internal = useMemo(() => ({
    length: Math.max(0, config.length - config.wall * 2),
    width: Math.max(0, config.width - config.wall * 2),
    height: Math.max(0, config.height - config.wall),
  }), [config]);

  const payload = useMemo(() => ({
    CASE_L: config.length,
    CASE_W: config.width,
    CASE_H: config.height,
    WALL_T: config.wall,
    LID_H: config.lidHeight,
    LH: config.screwThickness,
    CASE_R: config.cornerRadius,
  }), [config]);

  const update = <K extends keyof Config>(key: K, value: Config[K]) => setConfig((current) => ({ ...current, [key]: value }));

  const selectFamily = (family: CaseFamily) => {
    if (family === "SEALED") return;
    setConfig((current) => ({ ...current, family, ...FAMILY_PRESETS[family] }));
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `enclosure-${config.family.toLowerCase()}-${config.length}x${config.width}x${config.height}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="殼造所首頁">
          <span className="brand-mark"><Box size={19} strokeWidth={2.2} /></span>
          <span>殼造所 <small>CASEFORM</small></span>
        </a>
        <nav className="stepper" aria-label="設計流程">
          <span className="step active"><b>1</b> 外殼規格</span>
          <ChevronRight size={15} />
          <span className="step"><b>2</b> 開孔與固定</span>
          <ChevronRight size={15} />
          <span className="step"><b>3</b> 確認送出</span>
        </nav>
        <div className="save-state"><Check size={15} /> 參數已同步</div>
      </header>

      <div className="workspace" id="top">
        <aside className="config-panel">
          <div className="panel-intro">
            <p className="eyebrow">STEP 01 / BASE ENCLOSURE</p>
            <h1>先決定外殼的大致樣貌</h1>
            <p>不用畫圖。從常用骨架開始，調整到接近你想要的大小即可。</p>
          </div>

          <section className="form-section">
            <div className="section-title"><span>01</span><div><h2>選擇外殼骨架</h2><p>後續仍可個別調整尺寸</p></div></div>
            <div className="family-list">
              {(Object.keys(FAMILY_PRESETS) as CaseFamily[]).map((family) => (
                <button
                  key={family}
                  type="button"
                  className={`family-option ${config.family === family ? "selected" : ""}`}
                  onClick={() => selectFamily(family)}
                  disabled={family === "SEALED"}
                >
                  <span className="family-icon"><Box size={20} /></span>
                  <span><strong>{FAMILY_LABELS[family].name}</strong><small>{FAMILY_LABELS[family].note}</small></span>
                  {config.family === family && <Check className="selected-check" size={17} />}
                  {family === "SEALED" && <em className="coming-soon">規劃中</em>}
                </button>
              ))}
            </div>
            <div className="fixed-specs" aria-label="輕量型固定設計規格">
              <span><small>固定壁厚</small><strong>2.4 mm</strong></span>
              <span><small>固定圓角</small><strong>R4.5</strong></span>
              <span><small>上蓋方式</small><strong>螺絲固定</strong></span>
            </div>
          </section>

          <section className="form-section">
            <div className="section-title"><span>02</span><div><h2>外觀尺寸</h2><p>先填外殼外部最大尺寸</p></div></div>
            <NumberControl label="長度 CASE_L" value={config.length} min={50} max={120} onChange={(value) => update("length", value)} />
            <NumberControl label="寬度 CASE_W" value={config.width} min={50} max={120} onChange={(value) => update("width", value)} />
            <NumberControl label="本體高度 CASE_H" value={config.height} min={5} max={100} onChange={(value) => update("height", value)} />
            <NumberControl label="上蓋高度 LID_H" value={config.lidHeight} min={8} max={50} onChange={(value) => update("lidHeight", value)} />
          </section>
        </aside>

        <section className="preview-panel">
          <div className="preview-head">
            <div>
              <p className="eyebrow">LIVE 3D PREVIEW</p>
              <h2>{FAMILY_LABELS[config.family].name}外殼 <span>{config.length} × {config.width} × {config.height} mm ＋ 上蓋 {config.lidHeight} mm</span></h2>
            </div>
            <div className="view-actions">
              <button type="button" className={transparent ? "active" : ""} onClick={() => setTransparent((value) => !value)} title="切換透明外殼">
                {transparent ? <Eye size={17} /> : <EyeOff size={17} />} 透視
              </button>
              <button type="button" className={exploded ? "active" : ""} onClick={() => setExploded((value) => !value)} title="切換爆炸視圖">
                <Maximize2 size={17} /> 爆炸圖
              </button>
              <button className="icon-button" type="button" onClick={() => setResetToken((value) => value + 1)} title="重設視角" aria-label="重設視角"><RotateCcw size={17} /></button>
            </div>
          </div>

          <div className="canvas-stage">
            <EnclosureCanvas config={config} exploded={exploded} transparent={transparent} resetToken={resetToken} />
            <div className="dimension-chip chip-l">L {config.length}</div>
            <div className="dimension-chip chip-w">W {config.width}</div>
            <div className="dimension-chip chip-h">H {config.height}</div>
            <div className="dimension-chip chip-lid">LID_H {config.lidHeight}</div>
            <div className="drag-hint"><RotateCcw size={14} /> 拖曳旋轉 · 滾輪縮放</div>
            <div className="preview-badge"><Sparkles size={14} /> 即時參數模型</div>
          </div>

          <div className="spec-strip">
            <div><span>本體外部尺寸</span><strong>{config.length} × {config.width} × {config.height}</strong><small>mm</small></div>
            <div><span>內部可用空間</span><strong>{internal.length.toFixed(1)} × {internal.width.toFixed(1)} × {internal.height.toFixed(1)}</strong><small>mm</small></div>
            <div><span>固定結構</span><strong>輕量型・4 點螺絲</strong><small>壁厚 2.4・R4.5</small></div>
          </div>

          <div className="preview-footer">
            <div className="notice">
              <Info size={18} />
              <p><strong>這是溝通用的視覺替身</strong><span>下一步再確認 PCB 孔位、接頭開孔與實際干涉；目前尺寸不直接代表可製造性或防水等級。</span></p>
            </div>
            <div className="footer-actions">
              <button type="button" className="secondary-button" onClick={copyJson}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "已複製" : "複製參數"}</button>
              <button type="button" className="primary-button" onClick={downloadJson}><Download size={17} /> 匯出設計需求</button>
            </div>
          </div>
        </section>

        <aside className="data-drawer">
          <div className="drawer-head"><div><span className="status-dot" /> SOLIDWORKS READY</div><small>SCHEMA v1.0</small></div>
          <h2>設計參數</h2>
          <p>送出後會以這組欄位建立 SolidWorks 母版副本。</p>
          <div className="parameter-table">
            {Object.entries(payload).map(([key, value]) => (
              <div key={key}><code>{key}</code><span>{String(value)}{typeof value === "number" ? " mm" : ""}</span></div>
            ))}
          </div>
          <div className="workflow-note">
            <span>本階段自動化到這裡</span>
            <strong>外殼母版生成</strong>
            <div className="flow-line"><i className="done" /><i className="done" /><i /></div>
            <p>開孔、PCB 固定柱與細部干涉，仍由設計師人工處理。</p>
          </div>
          <button type="button" className="drawer-download" onClick={downloadJson}><Download size={16} /> 下載 JSON</button>
        </aside>
      </div>
    </main>
  );
}
