import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the CASEFORM seven-step configurator", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CASEFORM｜PCB 外殼快速訂製<\/title>/i);
  assert.match(html, /選擇使用環境/);
  assert.match(html, /外殼類型/);
  assert.match(html, /PCB 資料/);
  assert.match(html, /確認 PCB 尺寸/);
  assert.match(html, /確認外殼尺寸/);
  assert.match(html, /六面客製/);
  assert.match(html, /製作與報價/);
  assert.match(html, /確認送出/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("keeps the FA01A Three.js preview scoped to steps five and six", async () => {
  const [page, layout, preview, packageJson, modelText] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Enclosure3DPreview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/models/fa01a-lightweight.json", import.meta.url), "utf8"),
  ]);

  const renderedPreviews = page.match(/<Enclosure3DPreview\b/g) ?? [];
  assert.equal(renderedPreviews.length, 2, "expected 3D previews only in steps five and six");
  assert.match(page, /step === 5/);
  assert.match(page, /step === 6/);
  assert.match(page, /CASE_L/);
  assert.match(page, /CASE_W/);
  assert.match(page, /CASE_H/);
  assert.match(page, /LID_H/);
  assert.match(page, /requiresDesignFile/);
  assert.match(page, /只要設計檔時，請至少勾選一種檔案格式/);
  assert.match(page, /feature-face-badge/);
  assert.match(preview, /from "three"/);
  assert.match(preview, /fa01a-lightweight\.json/);
  assert.match(preview, /3D 零件顯示/);
  assert.match(preview, /showLid/);
  assert.match(preview, /showPcb/);
  assert.match(preview, /showBody/);
  assert.match(preview, /three-feature-callout/);
  assert.match(packageJson, /"three"/);
  assert.match(layout, /CASEFORM｜PCB 外殼快速訂製/);

  const model = JSON.parse(modelText);
  assert.equal(model.meshes.length, 2);
  assert.deepEqual(model.meshes.map((mesh) => mesh.name), ["FA01A_S_本體_CNC", "FA01A_S_上蓋_CNC"]);

  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
});

test("keeps PCB holes unified and enclosure limits explicit", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /type Hole = \{ x: number; y: number \}/);
  assert.match(page, /統一孔徑 Ø \{pcb\.holeDiameter\} mm/);
  assert.doesNotMatch(page, /hole\.diameter|diameter:\s*pcb\.holeDiameter/);
  assert.match(page, /外殼長度','CASE_L',50,150/);
  assert.match(page, /外殼寬度','CASE_W',50,150/);
  assert.match(page, /本體高度','CASE_H',15,100/);
  assert.match(page, /className="placed-pcb-origin"/);
  assert.match(page, /孔位超出 PCB 最大尺寸/);
  assert.match(page, /select aria-label="固定壁厚"/);
  assert.doesNotMatch(page, /<p className="suggestion-formula"/);
});
