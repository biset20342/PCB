"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Enclosure3DPreview } from "./components/Enclosure3DPreview";

type EnclosureType = "standard" | "sealed";
type Method = "pla" | "asa" | "cnc";
type Face = "top" | "bottom" | "front" | "back" | "left" | "right";
type Feature = { id: number; kind: "opening" | "connector" | "thermal"; label: string };
type Hole = { x: number; y: number };
type PcbPlacement = { x: number; y: number; rotation: number };

const steps = ["外殼類型", "PCB 資料", "確認 PCB 尺寸", "確認外殼尺寸", "六面客製", "製作與報價", "確認送出"];
const faceLabels: Record<Face, string> = { top: "上面", bottom: "下面", front: "前面", back: "後面", left: "左面", right: "右面" };
const emptyFaces: Record<Face, Feature[]> = { top: [], bottom: [], front: [], back: [], left: [], right: [] };
const methodLabels: Record<Method, string> = { pla: "PLA 3D 列印", asa: "ASA 3D 列印", cnc: "6 系列鋁合金 CNC" };

function PreviewModel({ sealed = false, compact = false, features = 0 }: { sealed?: boolean; compact?: boolean; features?: number }) {
  return (
    <div className={`preview-wrap ${compact ? "compact" : ""} ${sealed ? "sealed" : ""}`}>
      <div className="preview-badge"><i /> 即時預覽</div>
      <div className="model-scene">
        <div className="model-shadow" />
        <div className="case-lid"><span /><span /><span /><span />{features > 0 && <b className="feature-mark">+{features}</b>}</div>
        <div className="pcb-board"><i /><i /><i /><i /><b>PCB</b></div>
        <div className="case-base"><span /><span /></div>
      </div>
      <div className="orbit-hint">↻ 拖曳查看外殼示意</div>
    </div>
  );
}

function PcbPlanPreview({ width, depth, componentHeight, holeDiameter, holes }: { width: number; depth: number; componentHeight: number; holeDiameter: number; holes: Hole[] }) {
  const safeWidth = Math.max(width, 1);
  const safeDepth = Math.max(depth, 1);
  return (
    <div className="pcb-plan-wrap">
      <div className="preview-badge"><i /> 平面即時預覽</div>
      <div className="pcb-plan-stage">
        <div className="pcb-plan-board" style={{ aspectRatio: `${safeWidth} / ${safeDepth}` }}>
          <span className="pcb-chip main-chip" /><span className="pcb-chip port-chip" /><span className="pcb-chip small-chip" />
          <span className="pcb-trace trace-one" /><span className="pcb-trace trace-two" /><b>PCB</b>
          {holes.map((hole, index) => {
            return (
            <span
              className={`pcb-plan-hole ${hole.x / safeWidth > 0.65 ? "label-left" : ""} ${hole.x < 0 || hole.x > width || hole.y < 0 || hole.y > depth ? "invalid" : ""}`}
              key={`${index}-${hole.x}-${hole.y}`}
              style={{ left: `${Math.min(97, Math.max(3, (hole.x / safeWidth) * 100))}%`, bottom: `${Math.min(97, Math.max(3, (hole.y / safeDepth) * 100))}%` }}
              title={`H${index + 1} X ${hole.x} / Y ${hole.y} / Ø ${holeDiameter} mm`}
            ><i /><b>H{index + 1} · Ø{holeDiameter}</b></span>
          );})}
          <span className="dimension-line width-line"><em>{width} mm</em></span>
          <span className="dimension-line depth-line"><em>{depth} mm</em></span>
          <span className="pcb-origin-marker"><i className="origin-x" /><i className="origin-y" /><b>X0 / Y0</b></span>
        </div>
      </div>
      <div className="pcb-plan-legend"><span><i /> PCB 外框</span><span><i /> {holes.length} 個孔位</span></div>
      <div className="pcb-front-view">
        <div className="pcb-front-title"><b>正視圖</b><span>最高元件尺寸</span></div>
        <div className="pcb-front-stage">
          <span className="pcb-front-board" />
          <span className="pcb-front-component component-low" />
          <span className="pcb-front-component component-mid" />
          <span className="pcb-front-component component-high" />
          <span className="component-height-line"><em>{componentHeight} mm</em></span>
        </div>
      </div>
    </div>
  );
}

function EnclosurePlanPreview({ enclosureWidth, enclosureHeight, caseDepth, lidHeight, pcbWidth, pcbDepth, holeDiameter, holes, placement, showPcb, onTogglePcb }: { enclosureWidth: number; enclosureHeight: number; caseDepth: number; lidHeight: number; pcbWidth: number; pcbDepth: number; holeDiameter: number; holes: Hole[]; placement: PcbPlacement; showPcb: boolean; onTogglePcb: () => void }) {
  const safeEnclosureWidth = Math.max(enclosureWidth, 1);
  const safeEnclosureHeight = Math.max(enclosureHeight, 1);
  const safePcbWidth = Math.max(pcbWidth, 1);
  const safePcbDepth = Math.max(pcbDepth, 1);
  const lidShare = Math.min(42, Math.max(22, (lidHeight / Math.max(caseDepth + lidHeight, 1)) * 100));
  return (
    <div className="enclosure-plan-wrap">
      <div className="preview-toolbar">
        <div className="preview-badge"><i /> 平面即時預覽</div>
        <button type="button" className={showPcb ? "active" : ""} aria-pressed={showPcb} onClick={onTogglePcb}><i /> {showPcb ? "隱藏 PCB" : "顯示 PCB"}</button>
      </div>
      <div className="enclosure-plan-stage">
        <div className="enclosure-plan-shell" style={{ aspectRatio: `${safeEnclosureWidth} / ${safeEnclosureHeight}` }}>
          <span className="enclosure-inner-line" />
          {showPcb && (
            <div className="placed-pcb" style={{ width: `${(safePcbWidth / safeEnclosureWidth) * 100}%`, height: `${(safePcbDepth / safeEnclosureHeight) * 100}%`, left: `${(placement.x / safeEnclosureWidth) * 100}%`, bottom: `${(placement.y / safeEnclosureHeight) * 100}%`, transform: `rotate(${placement.rotation}deg)` }}>
              <b>PCB</b>
              {holes.map((hole, index) => <i key={`${index}-${hole.x}-${hole.y}`} style={{ left: `${(hole.x / safePcbWidth) * 100}%`, bottom: `${(hole.y / safePcbDepth) * 100}%`, width: `${Math.max(1.8, (holeDiameter / safePcbWidth) * 100)}%`, height: "auto", aspectRatio: "1" }} title={`H${index + 1} · Ø${holeDiameter} mm`} />)}
              <span className="placed-pcb-origin"><i className="origin-x" /><i className="origin-y" /><em>X0 / Y0</em></span>
            </div>
          )}
          <span className="dimension-line enclosure-width-line"><em>W {enclosureWidth} mm</em></span>
          <span className="dimension-line enclosure-height-line"><em>H {enclosureHeight} mm</em></span>
        </div>
      </div>
      <div className="enclosure-plan-legend"><span><i /> 外殼內部</span>{showPcb && <span><i /> PCB：X {placement.x} / Y {placement.y} / {placement.rotation}° · {holes.length} 孔 · Ø {holeDiameter} mm</span>}</div>
      <div className="enclosure-front-view">
        <div className="enclosure-front-title"><b>外殼側視圖</b><span>確認上蓋、本體與 PCB 的高度關係</span></div>
        <div className="enclosure-front-stage">
          <div className="enclosure-front-shape">
            <span className="enclosure-front-lid" style={{ height: `${lidShare}%` }}><b>上蓋</b></span>
            <span className="enclosure-front-body" style={{ top: `${lidShare}%` }}><b>本體</b></span>
            {showPcb && <span className="enclosure-side-pcb">PCB</span>}
          </div>
          <span className="front-lid-dimension" style={{ height: `${lidShare}%` }}><em>上蓋 {lidHeight} mm</em></span>
          <span className="front-case-dimension" style={{ top: `${lidShare}%` }}><em>本體 {caseDepth} mm</em></span>
        </div>
        <div className="enclosure-front-legend"><span><i className="lid" />上蓋</span><span><i className="body" />本體</span>{showPcb && <span><i className="pcb" />PCB 安裝面</span>}</div>
      </div>
    </div>
  );
}

function StepHeader({ number, kicker, title, description }: { number: number; kicker: string; title: string; description: string }) {
  return (
    <div className="step-heading">
      <div className="eyebrow"><span>{String(number).padStart(2, "0")}</span> {kicker}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [enclosureType, setEnclosureType] = useState<EnclosureType>("standard");
  const [inputMode, setInputMode] = useState<"photo" | "custom" | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [pcb, setPcb] = useState({ width: 68.6, depth: 53.3, componentHeight: 14, holeDiameter: 3.2 });
  const [holes, setHoles] = useState<Hole[]>([
    { x: 14, y: 2.5 }, { x: 66, y: 7.6 },
    { x: 66, y: 35.6 }, { x: 15.2, y: 50.8 },
  ]);
  const [enclosure, setEnclosure] = useState({ width: 88.6, depth: 19, height: 73.3, lidHeight: 8 });
  const [pcbPlacement, setPcbPlacement] = useState<PcbPlacement>({ x: 10, y: 10, rotation: 0 });
  const [showPcbInEnclosure, setShowPcbInEnclosure] = useState(true);
  const [selectedFace, setSelectedFace] = useState<Face>("front");
  const [faces, setFaces] = useState<Record<Face, Feature[]>>(emptyFaces);
  const [openingShape, setOpeningShape] = useState("矩形");
  const [connectorType, setConnectorType] = useState("USB Type-C");
  const [method, setMethod] = useState<Method>("pla");
  const [finish, setFinish] = useState("黑色");
  const [physical, setPhysical] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [files, setFiles] = useState({ stl: true, step: false, drawing: false });
  const [payment, setPayment] = useState(false);
  const [success, setSuccess] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const featureCount = Object.values(faces).flat().length;
  const faceFeatureCounts = useMemo(() => ({
    top: faces.top.length,
    bottom: faces.bottom.length,
    front: faces.front.length,
    back: faces.back.length,
    left: faces.left.length,
    right: faces.right.length,
  }), [faces]);
  const hasThermal = Object.values(faces).flat().some((item) => item.kind === "thermal");
  const isCnc = method === "cnc" || enclosureType === "sealed";
  const hasSelectedFile = files.stl || files.step || files.drawing;
  const requiresDesignFile = !physical && !hasSelectedFile;
  const invalidHoleIndexes = holes.reduce<number[]>((indexes, hole, index) => {
    if (hole.x < 0 || hole.x > pcb.width || hole.y < 0 || hole.y > pcb.depth) indexes.push(index);
    return indexes;
  }, []);
  const hasInvalidHoles = invalidHoleIndexes.length > 0;
  const enclosureRangeErrors = [
    enclosure.width < 50 || enclosure.width > 150 ? "外殼長度必須介於 50～150 mm" : "",
    enclosure.height < 50 || enclosure.height > 150 ? "外殼寬度必須介於 50～150 mm" : "",
    enclosure.depth < 15 || enclosure.depth > 100 ? "本體高度必須介於 15～100 mm" : "",
    enclosure.lidHeight < 8 || enclosure.lidHeight > 50 ? "上蓋高度必須介於 8～50 mm" : "",
  ].filter(Boolean);
  const hasInvalidEnclosure = enclosureRangeErrors.length > 0;

  useEffect(() => {
    if (enclosureType === "sealed" || hasThermal) {
      setMethod("cnc");
      setFinish("陽極黑色");
    }
  }, [enclosureType, hasThermal]);

  useEffect(() => {
    const snapshot = { step, enclosureType, pcb, holes, enclosure, pcbPlacement, showPcbInEnclosure, faces, method, finish, physical, quantity, files };
    localStorage.setItem("caseform-draft", JSON.stringify(snapshot));
  }, [step, enclosureType, pcb, holes, enclosure, pcbPlacement, showPcbInEnclosure, faces, method, finish, physical, quantity, files]);

  const estimate = useMemo(() => {
    const base = method === "pla" ? 1680 : method === "asa" ? 2380 : 4800;
    const custom = featureCount * 260 + (hasThermal ? 640 : 0);
    const fileCost = (files.stl ? 0 : 0) + (files.step ? 800 : 0) + (files.drawing ? 1200 : 0);
    const making = physical ? Math.round((base + custom) * (1 + Math.max(0, quantity - 1) * 0.52)) : 900;
    return making + fileCost;
  }, [method, featureCount, hasThermal, files, physical, quantity]);

  const goTo = (target: number) => {
    if (step === 3 && target > 3 && hasInvalidHoles) {
      setNotice("請先修正超出 PCB 最大尺寸的孔位");
      return;
    }
    if (step === 4 && target > 4 && hasInvalidEnclosure) {
      setNotice("請先將外殼參數調整到允許範圍內");
      return;
    }
    if (step === 6 && target > 6 && requiresDesignFile) {
      setNotice("只要設計檔時，請至少選擇一種檔案格式");
      return;
    }
    setPayment(false);
    setStep(target);
    setMaxStep((current) => Math.max(current, target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => goTo(Math.min(7, step + 1));
  const back = () => goTo(Math.max(1, step - 1));

  const handleFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const selected = Array.from(list).slice(0, 3);
    imagePreviews.forEach(URL.revokeObjectURL);
    setFileNames(selected.map((file) => file.name));
    setImagePreviews(selected.map((file) => URL.createObjectURL(file)));
    setInputMode("photo");
  };

  const analyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setPcb({ width: 68.6, depth: 53.3, componentHeight: 14, holeDiameter: 3.2 });
      setEnclosure({ width: 88.6, depth: 19, height: 73.3, lidHeight: 8 });
      setPcbPlacement({ x: 10, y: 10, rotation: 0 });
      setAnalyzing(false);
      goTo(3);
    }, 1400);
  };

  const startCustom = () => {
    setInputMode("custom");
    setPcb({ width: 100, depth: 70, componentHeight: 15, holeDiameter: 3.2 });
    setEnclosure({ width: 120, depth: 20, height: 90, lidHeight: 8 });
    setPcbPlacement({ x: 10, y: 10, rotation: 0 });
    setHoles([]);
    goTo(3);
  };

  const updatePcb = (key: keyof typeof pcb, value: number) => {
    setPcb((old) => ({ ...old, [key]: value }));
    if (key === "width") setEnclosure((old) => ({ ...old, width: value + 20 }));
    if (key === "depth") setEnclosure((old) => ({ ...old, height: value + 20 }));
    if (key === "componentHeight") setEnclosure((old) => ({ ...old, depth: value + 5 }));
  };

  const updateHole = (index: number, key: keyof Hole, value: number) => {
    setHoles((old) => old.map((hole, i) => i === index ? { ...hole, [key]: value } : hole));
  };

  const addFeature = (kind: Feature["kind"]) => {
    const existing = faces[selectedFace];
    if (kind === "thermal" && existing.some((item) => item.kind === "thermal")) {
      setNotice("這一面已增加散熱表面積。 ");
      return;
    }
    const label = kind === "opening" ? `${openingShape}開口 12 × 8 mm` : kind === "connector" ? `${connectorType} 接頭孔` : "增加外殼散熱表面積";
    setFaces((old) => ({ ...old, [selectedFace]: [...old[selectedFace], { id: Date.now(), kind, label }] }));
    setNotice(`已加入${faceLabels[selectedFace]}：${label}`);
  };

  const removeFeature = (face: Face, id: number) => setFaces((old) => ({ ...old, [face]: old[face].filter((item) => item.id !== id) }));

  const reset = () => {
    localStorage.removeItem("caseform-draft");
    setStep(1); setMaxStep(1); setPayment(false); setSuccess(false); setFaces(emptyFaces);
    setInputMode(null); setFileNames([]); setMethod("pla"); setEnclosureType("standard");
    setNotice("已建立新的訂製需求");
  };

  if (success) {
    return (
      <main className="success-page">
        <div className="success-card">
          <div className="success-icon">✓</div>
          <div className="eyebrow"><span>完成</span> 需求已送出</div>
          <h1>{isCnc ? "我們已收到你的詢價需求" : "付款成功，訂單已成立"}</h1>
          <p>{isCnc ? "工程團隊將確認加工內容，並寄送正式報價與交期。" : "接下來會進行工程檢查，我們會透過 Email 通知進度。"}</p>
          <div className="order-ticket">
            <span>需求編號</span><strong>PCB-20260816-001</strong>
            <span>目前狀態</span><b>{isCnc ? "等待正式報價" : "等待工程確認"}</b>
            <span>預估通知時間</span><b>{isCnc ? "1–2 個工作天" : "24 小時內"}</b>
          </div>
          <button className="primary-button" onClick={reset}>建立另一個外殼 <span>→</span></button>
        </div>
        <PreviewModel sealed={enclosureType === "sealed"} compact features={featureCount} />
      </main>
    );
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <button className="brand brand-button" onClick={reset} aria-label="Caseform 回到首頁">
          <span className="brand-mark"><i /><i /></span><span>CASEFORM</span>
        </button>
        <div className="top-actions">
          <span className="save-state"><b>●</b> 已自動儲存</span>
          <button className="ghost-button" type="button" onClick={() => setHelpOpen(true)}>需要協助？</button>
        </div>
      </header>

      {!payment && (
        <nav className="stepper" aria-label="訂製流程">
          {steps.map((item, index) => {
            const number = index + 1;
            return (
              <button className={`step ${number === step ? "active" : ""} ${number < step ? "done" : ""}`} key={item} disabled={number > maxStep} onClick={() => number <= maxStep && goTo(number)}>
                <span>{number < step ? "✓" : number}</span><em>{item}</em>
              </button>
            );
          })}
        </nav>
      )}

      <div className="wizard-stage">
        {payment ? (
          <Payment estimate={estimate} onBack={() => setPayment(false)} onSuccess={() => setSuccess(true)} />
        ) : (
          <>
            {step === 1 && (
              <section className="hero-grid type-selection-only">
                <div className="choice-panel">
                  <StepHeader number={1} kicker="外殼類型" title="選擇使用環境" description="選擇最接近的使用環境，我們會替你準備合適的設計與製作選項。" />
                  <div className="type-options" role="radiogroup" aria-label="外殼類型">
                    <button className={`type-card ${enclosureType === "standard" ? "selected" : ""}`} onClick={() => setEnclosureType("standard")} role="radio" aria-checked={enclosureType === "standard"}>
                      <span className="card-icon cube-icon"><i /></span><span className="card-copy"><strong>一般型</strong><small>適合室內乾燥的環境，最經濟的成本選項</small><span className="tags"><i>3D 列印</i><i>鋁合金 CNC</i></span></span><span className="radio-dot" />
                    </button>
                    <button className={`type-card ${enclosureType === "sealed" ? "selected" : ""}`} onClick={() => setEnclosureType("sealed")} role="radio" aria-checked={enclosureType === "sealed"}>
                      <span className="card-icon seal-icon">◇</span><span className="card-copy"><strong>密封型</strong><small>採用密封結構，適合潮濕、粉塵的環境</small><span className="tags"><i>鋁合金 CNC</i></span></span><span className="radio-dot" />
                    </button>
                  </div>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="content-page upload-page">
                <div className="page-copy">
                  <StepHeader number={2} kicker="PCB 資料" title="確認 PCB 板孔位尺寸" description="上傳量測照片，由 AI 協助辨識 PCB 外形尺寸；也可以選擇完全手動設定。" />
                  <div className="mode-grid">
                    <button className={`mode-card ${inputMode === "photo" ? "selected" : ""}`} onClick={() => uploadRef.current?.click()}>
                      <span className="mode-no">A</span><b>上傳照片 AI 輔助辨識</b><small>請提供 3 張照片：PCB 正面照片並搭配量尺</small><strong>選擇照片 <span>↗</span></strong>
                    </button>
                    <button className={`mode-card ${inputMode === "custom" ? "selected" : ""}`} onClick={startCustom}>
                      <span className="mode-no">B</span><b>完全自訂尺寸</b><small>沒有照片也沒關係，直接輸入資料</small><strong>開始手動設定 <span>→</span></strong>
                    </button>
                  </div>
                  <input ref={uploadRef} className="sr-only" type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} />
                  {fileNames.length > 0 && (
                    <div className="upload-result">
                      <div className="preview-thumbs">{imagePreviews.map((src, index) => <img src={src} alt={`PCB 預覽 ${index + 1}`} key={src} />)}</div>
                      <div><b>已加入 {fileNames.length} 張照片</b><small>{fileNames.join("、")}</small></div>
                      <button onClick={analyze} disabled={analyzing}>{analyzing ? "正在分析 PCB…" : "開始模擬辨識"}</button>
                    </div>
                  )}
                  {analyzing && <div className="analysis-progress"><i /><span>正在定位板框與固定孔</span></div>}
                  <aside className="green-guide"><b>建議量測方式</b><span>請分別量測 PCB 的最大長度、最大寬度，以及任一較小特徵，讓 AI 能建立可靠的尺寸比例。</span></aside>
                  <div className="measurement-examples" aria-label="PCB 拍照量測範例">
                    <article><img src="/examples/pcb-max-length.jpg" alt="量測 PCB 最大長度範例" /><div><b>01　最大長度</b><span>量尺跨過板件最長的兩端</span></div></article>
                    <article><img src="/examples/pcb-max-width.jpg" alt="量測 PCB 最大寬度範例" /><div><b>02　最大寬度</b><span>量尺跨過板件最寬的兩端</span></div></article>
                    <article><img src="/examples/pcb-small-feature.jpg" alt="量測 PCB 較小特徵範例" /><div><b>03　較小特徵</b><span>任選一個清楚的小尺寸作為比例參考</span></div></article>
                  </div>
                </div>
                <div className="upload-visual"><div className="photo-frame"><div className="scan-line" /><div className="flat-pcb"><i /><i /><i /><i /><b>PCB</b></div><span>AI ANALYSIS / MOCK</span></div></div>
              </section>
            )}

            {step === 3 && (
              <section className="content-page editor-page">
                <div className="page-copy wide-copy">
                  <StepHeader number={3} kicker="確認 PCB 尺寸" title="確認最終尺寸結果" description="確認 PCB 的尺寸後，下一步會開始進行外殼尺寸設定。" />
                  <div className="form-section">
                    <div className="section-title"><b>PCB 基本尺寸</b><span>單位：mm</span></div>
                    <div className="field-grid four">
                      {([['width','最大長度'],['depth','最大寬度'],['componentHeight','最高元件'],['holeDiameter','PCB 孔徑 Ø']] as const).map(([key,label]) => <label key={key}><span>{label}</span><div><input type="number" step="0.1" value={pcb[key]} onChange={(e) => updatePcb(key, Number(e.target.value))} /><i>mm</i></div></label>)}
                    </div>
                  </div>
                  <div className="form-section holes-section pcb-holes-section">
                    <div className="section-title"><b>PCB 孔位內容</b><span>統一孔徑 Ø {pcb.holeDiameter} mm</span><button onClick={() => setHoles((old) => [...old, { x: 10, y: 10 }])}>＋ 新增孔位</button></div>
                    <div className="hole-head"><span>孔位</span><span>X</span><span>Y</span><span /></div>
                    {holes.map((hole, index) => <div className={`hole-row ${invalidHoleIndexes.includes(index) ? "invalid" : ""}`} key={index}><b>H{index + 1}</b>{(['x','y'] as const).map((key) => <input aria-label={`H${index + 1} ${key}`} aria-invalid={invalidHoleIndexes.includes(index)} key={key} type="number" step="0.1" value={hole[key]} onChange={(e) => updateHole(index, key, Number(e.target.value))} />)}<button aria-label={`刪除孔位 H${index + 1}`} onClick={() => setHoles((old) => old.filter((_, i) => i !== index))}>×</button></div>)}
                    {holes.length === 0 && <p className="empty-row">目前沒有孔位；可新增孔位並輸入中心座標，所有孔位共用上方設定的 PCB 孔徑。</p>}
                    {hasInvalidHoles && <p className="hole-validation-error" role="alert">孔位超出 PCB 最大尺寸。X 必須介於 0–{pcb.width} mm，Y 必須介於 0–{pcb.depth} mm；請修正紅色孔位後再繼續。</p>}
                  </div>
                  <aside className="green-guide"><b>請特別確認</b><span>AI 辨識尺寸可能產生誤差，為了達到最好的設計結果，請依據實務尺寸確認。</span></aside>
                </div>
                <div className="sticky-preview pcb-preview-panel"><PcbPlanPreview width={pcb.width} depth={pcb.depth} componentHeight={pcb.componentHeight} holeDiameter={pcb.holeDiameter} holes={holes} /><div className="dimension-readout"><span>PCB 最大尺寸</span><strong>{pcb.width} × {pcb.depth} mm</strong><small>最高元件 {pcb.componentHeight} mm · {holes.length} 個孔位</small></div></div>
              </section>
            )}

            {step === 4 && (
              <section className="content-page editor-page enclosure-editor-page">
                <div className="page-copy wide-copy">
                  <StepHeader number={4} kicker="確認外殼尺寸" title="設定外殼尺寸" description="外殼長度 / 寬度建議至少大於 PCB 總長 / 總寬 20mm" />
                  <div className="form-section">
                    <div className="section-title"><b>外殼建議尺寸</b><span className="auto-tag">自動預留間隙</span></div>
                    <div className="field-grid four parameter-field-grid">
                      {([['width','外殼長度','CASE_L',50,150],['height','外殼寬度','CASE_W',50,150],['depth','本體高度','CASE_H',15,100],['lidHeight','上蓋高度','LID_H',8,50]] as const).map(([key,label,code,min,max]) => {
                        const invalid = enclosure[key] < min || enclosure[key] > max;
                        return <label className={invalid ? "parameter-invalid" : ""} key={key}><span>{label}<small>可設定範圍 {min}～{max} mm</small></span><div><input data-engineering-key={code} aria-label={`${label} ${min}～${max} mm`} aria-invalid={invalid} type="number" min={min} max={max} step="0.1" value={enclosure[key]} onChange={(e) => setEnclosure((old) => ({ ...old, [key]: Number(e.target.value) }))} /><i>mm</i></div></label>;
                      })}
                    </div>
                    <div className="fixed-parameter-specs"><label data-engineering-key="WALL_T"><span>固定壁厚</span><select aria-label="固定壁厚" value="2.4 mm" onChange={() => {}}><option>2.4 mm</option></select></label><label data-engineering-key="CASE_R"><span>固定圓角</span><select aria-label="固定圓角" value="R4.5" onChange={() => {}}><option>R4.5</option></select></label><label data-engineering-key="LID_TYPE"><span>上蓋方式</span><select aria-label="上蓋方式" value="螺絲固定" onChange={() => {}}><option>螺絲固定</option></select></label></div>
                    {hasInvalidEnclosure && <p className="parameter-validation-error" role="alert">{enclosureRangeErrors.join("；")}。請修正後再繼續。</p>}
                  </div>
                  <div className="form-section pcb-placement-section">
                    <div className="section-title"><b>PCB 孔位配置</b><span>{holes.length} 個孔位同步移動</span></div>
                    <div className="field-grid three">
                      <label><span>X 平移</span><div><input type="number" step="0.1" value={pcbPlacement.x} onChange={(e) => setPcbPlacement((old) => ({ ...old, x: Number(e.target.value) }))} /><i>mm</i></div></label>
                      <label><span>Y 平移</span><div><input type="number" step="0.1" value={pcbPlacement.y} onChange={(e) => setPcbPlacement((old) => ({ ...old, y: Number(e.target.value) }))} /><i>mm</i></div></label>
                      <label><span>旋轉角度</span><div><input type="number" step="1" value={pcbPlacement.rotation} onChange={(e) => setPcbPlacement((old) => ({ ...old, rotation: Number(e.target.value) }))} /><i>°</i></div></label>
                    </div>
                    <div className="placement-actions">
                      <button type="button" onClick={() => setPcbPlacement({ x: Math.max(0, (enclosure.width - pcb.width) / 2), y: Math.max(0, (enclosure.height - pcb.depth) / 2), rotation: 0 })}>置中並歸零</button>
                      <button type="button" onClick={() => setPcbPlacement((old) => ({ ...old, rotation: ((old.rotation - 90) % 360 + 360) % 360 }))}>向左旋轉 90°</button>
                      <button type="button" onClick={() => setPcbPlacement((old) => ({ ...old, rotation: (old.rotation + 90) % 360 }))}>向右旋轉 90°</button>
                    </div>
                  </div>
                  <aside className="green-guide"><b>外殼尺寸說明</b><span>建議尺寸包含基本裝配間隙；正式製作前仍會依材料與加工方式進行工程確認。</span></aside>
                </div>
                <div className="sticky-preview enclosure-plan-panel"><EnclosurePlanPreview enclosureWidth={enclosure.width} enclosureHeight={enclosure.height} caseDepth={enclosure.depth} lidHeight={enclosure.lidHeight} pcbWidth={pcb.width} pcbDepth={pcb.depth} holeDiameter={pcb.holeDiameter} holes={holes} placement={pcbPlacement} showPcb={showPcbInEnclosure} onTogglePcb={() => setShowPcbInEnclosure((value) => !value)} /><div className="dimension-readout"><span>外殼最大尺寸</span><strong>長 {enclosure.width} × 寬 {enclosure.height} mm</strong><small>本體高度 {enclosure.depth} mm · 上蓋高度 {enclosure.lidHeight} mm</small></div></div>
              </section>
            )}

            {step === 5 && (
              <section className="customize-layout">
                <div className="custom-sidebar">
                  <StepHeader number={5} kicker="六面客製" title="點選你想修改的面" description="每一面都可以加入開口、接頭孔，或增加外殼散熱表面積。" />
                  <div className="face-grid">{(Object.keys(faceLabels) as Face[]).map((face) => <button key={face} className={selectedFace === face ? "selected" : ""} onClick={() => setSelectedFace(face)}><span>{faceLabels[face]}</span><b>{faces[face].length || "—"}</b></button>)}</div>
                  <aside className="green-guide"><b>目前編輯：{faceLabels[selectedFace]}</b><span>位置與尺寸在本 MVP 中以示意資料呈現，正式製作前仍會由工程人員確認。</span></aside>
                </div>
                <div className="custom-main">
                  <div className="case-canvas three-case-canvas"><Enclosure3DPreview family={enclosureType} length={enclosure.width} width={enclosure.height} height={enclosure.depth} lidHeight={enclosure.lidHeight} selectedFace={selectedFace} featureCounts={faceFeatureCounts} /><div className="face-name">目前查看：{faceLabels[selectedFace]} · {faces[selectedFace].length} 項客製</div></div>
                  <div className="feature-panel">
                    <div className="section-title"><b>在{faceLabels[selectedFace]}新增</b><span>{featureCount} 項總客製</span></div>
                    <div className="feature-actions">
                      <div className="feature-action"><span className="feature-icon">□</span><div><b>新增開口</b><small>圓形或矩形開口</small><select value={openingShape} onChange={(e) => setOpeningShape(e.target.value)}><option>矩形</option><option>圓形</option></select></div><button onClick={() => addFeature("opening")}>＋</button></div>
                      <div className="feature-action"><span className="feature-icon">⌁</span><div><b>新增接頭孔</b><small>使用常見接頭尺寸</small><select value={connectorType} onChange={(e) => setConnectorType(e.target.value)}><option>USB Type-A</option><option>USB Type-B</option><option>USB Type-C</option><option>USB Micro-B</option></select></div><button onClick={() => addFeature("connector")}>＋</button></div>
                      <div className="feature-action thermal-action"><span className="feature-icon">≋</span><div><b>增加外殼散熱表面積</b><small>僅適用 6 系列鋁合金 CNC</small></div><button onClick={() => addFeature("thermal")}>＋</button></div>
                    </div>
                    <div className="feature-list">
                      {faces[selectedFace].map((item) => <div key={item.id}><span><i>{item.kind === "opening" ? "開" : item.kind === "connector" ? "接" : "散"}</i><em className="feature-face-badge">{faceLabels[selectedFace]}</em>{item.label}</span><button onClick={() => removeFeature(selectedFace, item.id)}>移除</button></div>)}
                      {faces[selectedFace].length === 0 && <p>這一面尚未加入客製項目。</p>}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {step === 6 && (
              <section className="content-page quote-page">
                <div className="page-copy wide-copy">
                  <StepHeader number={6} kicker="製作與報價" title="選擇你要的交付方式" description="你可以只取得設計檔，也可以交給我們製作。價格會隨材料、數量與客製內容即時估算。" />
                  {enclosureType === "sealed" && <div className="constraint-banner"><b>密封型製作限制</b><span>密封型目前僅提供 6 系列鋁合金 CNC，已為你自動選擇。</span></div>}
                  {hasThermal && enclosureType !== "sealed" && <div className="constraint-banner"><b>散熱表面積需求</b><span>你的設計包含「增加外殼散熱表面積」，因此製作方式已切換為鋁合金 CNC。</span></div>}
                  <div className="form-section">
                    <div className="section-title"><b>製作方式</b><span>選擇一項</span></div>
                    <div className="method-grid">
                      {enclosureType === "standard" && !hasThermal && <><MethodCard id="pla" selected={method === "pla"} title="PLA 3D 列印" note="經濟基本型 · 約 55–60°C" onClick={() => { setMethod("pla"); setFinish("黑色"); }} /><MethodCard id="asa" selected={method === "asa"} title="ASA 3D 列印" note="抗紫外線耐熱 · 約 85–100°C" onClick={() => { setMethod("asa"); setFinish("黑色"); }} /></>}
                      <MethodCard id="cnc" selected={isCnc} title="6 系列鋁合金 CNC" note="高強度 · 高耐熱 · 良好導熱" onClick={() => { setMethod("cnc"); setFinish("陽極黑色"); }} />
                    </div>
                  </div>
                  <div className="form-row two-col">
                    <div className="form-section">
                      <div className="section-title"><b>顏色／表面處理</b></div>
                      <div className="choice-pills">{(isCnc ? ["陽極原色", "陽極黑色"] : ["白色", "黑色"]).map((item) => <button key={item} onClick={() => setFinish(item)} className={finish === item ? "selected" : ""}><i className={item.includes("黑") ? "black" : item.includes("原色") ? "metal" : "white"} />{item}</button>)}</div>
                    </div>
                    <div className="form-section">
                      <div className="section-title"><b>需要實體製作嗎？</b></div>
                      <div className="choice-pills"><button onClick={() => setPhysical(true)} className={physical ? "selected" : ""}>需要製作</button><button onClick={() => setPhysical(false)} className={!physical ? "selected" : ""}>只要設計檔</button></div>
                    </div>
                  </div>
                  {physical && <div className="form-section quantity-row"><div className="section-title"><b>製作數量</b></div><button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><strong>{quantity}</strong><button onClick={() => setQuantity(Math.min(20, quantity + 1))}>＋</button><span>件</span></div>}
                  <div className="form-section">
                    <div className="section-title"><b>需要哪些設計檔？</b><span>{physical ? "可複選" : "至少選擇一項"}</span></div>
                    <div className={`file-options ${requiresDesignFile ? "invalid" : ""}`} aria-invalid={requiresDesignFile}>{([['stl','STL','可直接 3D 列印'],['step','STEP','3D 工程模型'],['drawing','CAD 工程圖','加工尺寸與標註']] as const).map(([key,title,note]) => <button key={key} className={files[key] ? "selected" : ""} aria-pressed={files[key]} onClick={() => setFiles((old) => ({ ...old, [key]: !old[key] }))}><span>{files[key] ? "✓" : ""}</span><b>{title}</b><small>{note}</small></button>)}</div>
                    {requiresDesignFile && <p className="file-validation-error" role="alert">只要設計檔時，請至少勾選一種檔案格式。</p>}
                  </div>
                </div>
                <div className="quote-side"><Enclosure3DPreview compact family={enclosureType} length={enclosure.width} width={enclosure.height} height={enclosure.depth} lidHeight={enclosure.lidHeight} featureCounts={faceFeatureCounts} /><QuoteCard estimate={estimate} isCnc={isCnc} method={method} quantity={quantity} featureCount={featureCount} /></div>
              </section>
            )}

            {step === 7 && (
              <section className="review-page">
                <div className="review-main">
                  <StepHeader number={7} kicker="確認送出" title="這就是你的外殼方案" description="請快速確認以下內容。送出後，我們會依照這份需求進行下一步。" />
                  <div className="review-grid">
                    <SummaryBlock title="外殼" onEdit={() => goTo(4)}><strong>{enclosureType === "standard" ? "一般型" : "密封型"}</strong><span>長 {enclosure.width} × 寬 {enclosure.height} mm · 本體高 {enclosure.depth} mm · 上蓋高 {enclosure.lidHeight} mm</span></SummaryBlock>
                    <SummaryBlock title="PCB" onEdit={() => goTo(3)}><strong>{pcb.width} × {pcb.depth} mm</strong><span>{holes.length} 個孔位 · 最高元件 {pcb.componentHeight} mm</span></SummaryBlock>
                    <SummaryBlock title="六面客製" onEdit={() => goTo(5)}><strong>{featureCount ? `${featureCount} 項客製` : "未加入客製"}</strong><span>{(Object.keys(faceLabels) as Face[]).filter((face) => faces[face].length).map((face) => `${faceLabels[face]} ${faces[face].length}`).join(" · ") || "標準外殼表面"}</span></SummaryBlock>
                    <SummaryBlock title="製作與交付" onEdit={() => goTo(6)}><strong>{methodLabels[method]} · {finish}</strong><span>{physical ? `實體製作 ${quantity} 件` : "僅設計檔"} · {Object.entries(files).filter(([,value]) => value).map(([key]) => key.toUpperCase()).join(" / ") || "未選檔案"}</span></SummaryBlock>
                  </div>
                  <aside className="green-guide"><b>工程確認仍是必要步驟</b><span>此 MVP 的尺寸、3D 預覽與價格皆為流程模擬。正式製作前，工程人員會再次檢查裝配與加工可行性。</span></aside>
                </div>
                <div className="review-side"><QuoteCard estimate={estimate} isCnc={isCnc} method={method} quantity={quantity} featureCount={featureCount} review /></div>
              </section>
            )}
          </>
        )}
      </div>

      {!payment && (
        <footer className="bottom-bar">
          <button className="back-button" type="button" onClick={back} disabled={step === 1}>← 上一步</button>
          <p><span>{step === 7 ? "準備完成" : "接下來"}</span>{step === 1 ? "上傳 PCB 照片，或直接輸入尺寸" : step === 2 ? "確認 AI 辨識或手動輸入的 PCB 尺寸" : step === 3 ? "設定外殼與上蓋尺寸" : step === 4 ? "選擇外殼六個面的客製內容" : step === 5 ? "選擇製作方式與檔案" : step === 6 ? "確認全部設定與估價" : isCnc ? "送出需求並等待正式報價" : "進入模擬付款"}</p>
          {step < 7 ? <button className="primary-button" type="button" onClick={next} disabled={(step === 2 && !inputMode) || (step === 3 && hasInvalidHoles) || (step === 4 && hasInvalidEnclosure) || (step === 6 && requiresDesignFile)} title={step === 3 && hasInvalidHoles ? "請先修正超出 PCB 最大尺寸的孔位" : step === 4 && hasInvalidEnclosure ? "請先將外殼尺寸調整到允許範圍內" : step === 6 && requiresDesignFile ? "只要設計檔時，請至少選擇一種檔案格式" : undefined}>繼續：{steps[step]} <span>→</span></button> : <button className="primary-button" type="button" onClick={() => isCnc ? setSuccess(true) : setPayment(true)}>{isCnc ? "送出需求，等待正式報價" : "確認並前往付款"} <span>→</span></button>}
        </footer>
      )}

      {notice && <button className="toast" onClick={() => setNotice("")}>{notice}<span>×</span></button>}
      {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><div className="help-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setHelpOpen(false)}>×</button><div className="eyebrow"><span>?</span> 使用協助</div><h2>不知道怎麼填，也沒關係</h2><p>這是使用流程原型。你可以直接採用預設資料一路操作，所有報價、付款與訂單狀態都只是模擬，不會真的送出。</p><ul><li>建議準備最大長、最大寬與小特徵共 3 張量測照片。</li><li>PCB、外殼尺寸與固定孔可分步修改。</li><li>密封型只會顯示鋁合金 CNC。</li></ul><button className="primary-button" onClick={() => setHelpOpen(false)}>了解，繼續操作</button></div></div>}
    </main>
  );
}

function MethodCard({ id, selected, title, note, onClick }: { id: string; selected: boolean; title: string; note: string; onClick: () => void }) {
  return <button className={`method-card ${selected ? "selected" : ""}`} onClick={onClick}><span>{id === "cnc" ? "AL" : id.toUpperCase()}</span><b>{title}</b><small>{note}</small><i>{selected ? "✓" : ""}</i></button>;
}

function QuoteCard({ estimate, isCnc, method, quantity, featureCount, review = false }: { estimate: number; isCnc: boolean; method: Method; quantity: number; featureCount: number; review?: boolean }) {
  return (
    <aside className={`quote-card ${review ? "review-quote" : ""}`}>
      <div className="quote-top"><span>{isCnc ? "預估價格" : "目前價格"}</span><small>NT$</small><strong>{estimate.toLocaleString("zh-TW")}</strong></div>
      <div className="quote-lines"><span><i>製作方式</i><b>{methodLabels[method]}</b></span><span><i>數量</i><b>{quantity} 件</b></span><span><i>客製項目</i><b>{featureCount} 項</b></span></div>
      {isCnc ? <div className="cnc-warning"><b>此價格為系統初步預估</b><p>6 系列鋁合金 CNC 需依實際尺寸、加工內容與難度進行工程評估。送出需求後，我們將另行提供正式報價與交期。</p></div> : <p className="tax-note">模擬價格已包含設計與基本製作費用。</p>}
    </aside>
  );
}

function SummaryBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return <div className="summary-block"><div><span>{title}</span><button onClick={onEdit}>修改</button></div>{children}</div>;
}

function Payment({ estimate, onBack, onSuccess }: { estimate: number; onBack: () => void; onSuccess: () => void }) {
  const [processing, setProcessing] = useState(false);
  const submit = (e: React.FormEvent) => { e.preventDefault(); setProcessing(true); setTimeout(onSuccess, 900); };
  return (
    <section className="payment-page">
      <div className="payment-panel">
        <button className="text-back" onClick={onBack}>← 返回訂單確認</button>
        <div className="eyebrow"><span>付款</span> 安全模擬頁面</div>
        <h1>完成你的訂單</h1><p>請使用畫面上的測試資料。此頁面不會傳送或保存任何付款資訊。</p>
        <form onSubmit={submit}>
          <label><span>持卡人姓名</span><input required defaultValue="TEST USER" /></label>
          <label><span>信用卡卡號</span><input required inputMode="numeric" defaultValue="4242 4242 4242 4242" /></label>
          <div className="payment-fields"><label><span>有效期限</span><input required defaultValue="12/30" /></label><label><span>安全碼</span><input required inputMode="numeric" defaultValue="123" /></label></div>
          <button className="pay-button" disabled={processing}>{processing ? "正在處理…" : `模擬付款 NT$ ${estimate.toLocaleString("zh-TW")}`} <span>→</span></button>
        </form>
      </div>
      <div className="payment-summary"><span>ORDER SUMMARY</span><h2>CASEFORM<br />PCB 外殼</h2><div><i>一般型外殼</i><b>1 件</b></div><div><i>設計與製作</i><b>已包含</b></div><strong>NT$ {estimate.toLocaleString("zh-TW")}</strong><small>這是體驗用模擬付款，不會產生任何實際費用。</small></div>
    </section>
  );
}
