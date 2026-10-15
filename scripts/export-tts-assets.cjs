#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(
    path.join(
      execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
      "playwright",
    ),
  ));
}
const root = path.resolve(__dirname, "..");
const out = path.join(root, "assets/tts");
const args = process.argv.slice(2);
let baseUrl =
  "https://lsenjov-boardgame-bellwether.s3.ap-southeast-2.amazonaws.com/tabletop-simulator/";
if (args.length) {
  if (args.length !== 2 || args[0] !== "--base-url")
    throw Error("Usage: export-tts-assets.cjs [--base-url URL]");
  baseUrl = args[1];
}
const parsedBase = new URL(baseUrl);
if (
  parsedBase.protocol !== "https:" ||
  parsedBase.username ||
  parsedBase.password ||
  parsedBase.search ||
  parsedBase.hash
)
  throw Error("base URL must use HTTPS without credentials, query or fragment");
baseUrl = baseUrl.replace(/\/?$/, "/");
const manifest = {
  schemaVersion: 1,
  baseUrl,
  bucket: "lsenjov-boardgame-bellwether",
  prefix: "tabletop-simulator/",
  files: [],
  decks: [],
  objects: [],
};
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
function asset(name, buffer) {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const existing = manifest.files.find((file) => file.sha256 === sha256);
  if (existing) return { path: existing.path, url: baseUrl + existing.path };
  const relative = `images/${slug(name)}-${sha256.slice(0, 16)}.png`;
  fs.writeFileSync(path.join(out, relative), buffer);
  manifest.files.push({
    path: relative,
    sha256,
    bytes: buffer.length,
    contentType: "image/png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  });
  return { path: relative, url: baseUrl + relative };
}
async function load(page, file) {
  await page.goto(
    pathToFileURL(path.join(root, "docs/components", file + ".html")).href,
  );
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      ".clip-zone{display:none!important}.agent-face{border:0!important;padding-bottom:1mm!important}.agent-pair::after{display:none!important}",
  });
}
async function capture(page, selector, index, width) {
  const el = page.locator(selector).nth(index);
  const b = await el.boundingBox();
  if (!b) throw Error(`Missing ${selector} ${index}`);
  return el
    .screenshot({ type: "png", scale: "device" })
    .then((buffer) =>
      resize(buffer, width, Math.round((width * b.height) / b.width)),
    );
}
function resize(buffer, w, h) {
  return execFileSync(
    "python",
    [
      "-c",
      `import sys,io\nfrom PIL import Image\nim=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGBA');im.resize((${w},${h}),Image.Resampling.LANCZOS).save(sys.stdout.buffer,'PNG')`,
    ],
    { input: buffer, maxBuffer: 32 * 1024 * 1024 },
  );
}
function compose(buffers, back, cols, rows, w, h) {
  const temp = path.join(out, ".compose");
  fs.mkdirSync(temp, { recursive: true });
  buffers.forEach((b, i) => fs.writeFileSync(path.join(temp, i + ".png"), b));
  fs.writeFileSync(path.join(temp, "back.png"), back);
  const result = execFileSync(
    "python",
    [
      "-c",
      `import sys\nfrom PIL import Image\nfrom pathlib import Path\np=Path(sys.argv[1]);w,h,c,r,n=map(int,sys.argv[2:]);im=Image.new('RGB',(w*c,h*r),'#fffaf0')\nfor i in range(n): im.paste(Image.open(p/(str(i)+'.png')).convert('RGB'),((i%c)*w,(i//c)*h))\nim.paste(Image.open(p/'back.png').convert('RGB'),((c-1)*w,(r-1)*h));im.save(sys.stdout.buffer,'PNG')`,
      temp,
      String(w),
      String(h),
      String(cols),
      String(rows),
      String(buffers.length),
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  fs.rmSync(temp, { recursive: true });
  return result;
}
async function genericBack(page, label, w, h) {
  await page.setContent(
    `<body style="margin:0"><div style="box-sizing:border-box;width:${w}px;height:${h}px;background:#e8e2d5;border:8px solid #34443f;display:flex;align-items:center;justify-content:center;font: bold 26px serif;text-align:center;padding:20px">Bellwether<br>${label}</div></body>`,
  );
  return resize(await page.locator("div").screenshot(), w, h);
}
async function deck(page, id, category, faces, back, cards, w, h) {
  const cols = Math.min(10, Math.ceil(Math.sqrt(((faces.length + 1) * h) / w)));
  const rows = Math.ceil((faces.length + 1) / cols);
  if (rows > 7 || cols * w > 4096 || rows * h > 4096)
    throw Error("Atlas exceeds TTS limits");
  manifest.decks.push({
    id,
    name: id,
    category,
    count: faces.length,
    face: asset(id + "-faces", compose(faces, back, cols, rows, w, h)),
    back: asset(id + "-back", back),
    width: cols,
    height: rows,
    number: faces.length,
    backIsHidden: true,
    uniqueBack: false,
    cards,
  });
}
async function main() {
  fs.rmSync(path.join(out, "images"), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "images"), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1800, height: 1400 },
      deviceScaleFactor: 2,
    });
    for (const source of [
      "operation-cards",
      "bonus-cards",
      "firm-cards",
      "reward-cards",
    ]) {
      await load(page, source);
      const infos = await page
        .locator(".print-card.front[data-suit]")
        .evaluateAll((es) =>
          es.map((e, i) => ({
            i,
            suit: e.dataset.suit,
            id: e.dataset.cardId,
            name:
              e.querySelector("h2,h3")?.textContent?.trim() || e.dataset.rank,
          })),
        );
      for (const suit of [...new Set(infos.map((x) => x.suit))]) {
        const group = infos.filter((x) => x.suit === suit);
        const faces = [];
        for (const x of group)
          faces.push(
            resize(
              await capture(page, ".print-card.front[data-suit]", x.i, 320),
              320,
              488,
            ),
          );
        const backs = page.locator(`.print-card.back[data-suit="${suit}"]`);
        const back = resize(await backs.first().screenshot(), 320, 488);
        await deck(
          page,
          suit,
          source,
          faces,
          back,
          group.map((x, index) => ({ index, id: x.id, name: x.name })),
          320,
          488,
        );
      }
    }
    for (const [source, selector, id, label] of [
      ["printable-policy-cards", ".policy-card", "policies", "Policies"],
      [
        "printable-scoring-cards",
        ".scoring-card",
        "priorities",
        "Private priorities",
      ],
    ]) {
      await load(page, source);
      const n = await page.locator(selector).count(),
        faces = [],
        cards = [];
      let h;
      for (let i = 0; i < n; i++) {
        const face = await capture(page, selector, i, 378);
        h = face.readUInt32BE(20);
        faces.push(face);
        cards.push({
          index: i,
          id: `${id}-${i + 1}`,
          name: await page
            .locator(selector)
            .nth(i)
            .locator("h2,header")
            .first()
            .innerText(),
        });
      }
      const back = await genericBack(page, label, 378, h);
      await deck(page, id, id, faces, back, cards, 378, h);
    }
    async function objects(source, selector, kind, prefix, width) {
      await load(page, source);
      const n = await page.locator(selector).count();
      const designs = new Map();
      for (let i = 0; i < n; i++) {
        const e = page.locator(selector).nth(i);
        const design = await e.evaluate((node) => node.outerHTML);
        const existing = designs.get(design);
        if (existing) {
          existing.count++;
          continue;
        }
        const name = await e.evaluate(
          (node, fallback) =>
            node.getAttribute("aria-label") ||
            node.querySelector("h2,strong")?.textContent ||
            fallback,
          `${prefix} ${i + 1}`,
        );
        const image = asset(
          `${prefix}-${i + 1}`,
          await capture(page, selector, i, width),
        );
        const f = manifest.files.find((f) => f.path === image.path);
        const object = {
          id: `${prefix}-${i + 1}`,
          name: name.trim(),
          kind,
          count: 1,
          image,
          width: f.width,
          height: f.height,
        };
        designs.set(design, object);
        manifest.objects.push(object);
      }
    }
    await objects("party-boards", ".party-board", "board", "party-board", 1800);
    await objects(
      "firm-references",
      ".reference-page",
      "reference",
      "firm-reference",
      1800,
    );
    await objects(
      "player-aids",
      ".aid-page",
      "reference",
      "shared-reference",
      1200,
    );
    await objects(
      "shared-state-tokens",
      ".opening-card",
      "opening-marker",
      "opening-marker",
      320,
    );
    await objects(
      "shared-state-tokens",
      ".small-token",
      "token",
      "small-token",
      256,
    );
    await objects(
      "player-folios",
      ".player-folio",
      "board",
      "player-folio",
      1400,
    );
    await objects(
      "campaign-score-trackers",
      "table",
      "reference",
      "score-ledger",
      1800,
    );
    await load(page, "shared-state-tokens-duplex");
    for (const [kind, front, back] of [
      ["vote", "yes", "no"],
      ["range", "low", "high"],
    ]) {
      const image = asset(
        "reminder-" + kind + "-front",
        await capture(
          page,
          `[data-kind="${kind}"][data-face="${front}"]`,
          0,
          256,
        ),
      );
      const imageSecondary = asset(
        "reminder-" + kind + "-back",
        await capture(
          page,
          `[data-kind="${kind}"][data-face="${back}"]`,
          0,
          256,
        ),
      );
      manifest.objects.push({
        id: "reminder-" + kind,
        name: "Private " + kind + " reminder",
        kind: "tile",
        count: 24,
        image,
        imageSecondary,
        width: 256,
        height: 256,
      });
    }
    await load(page, "shared-state-tokens");
    for (let i = 0; i < 2; i++) {
      const image = asset(
        ["early-bird", "year"][i],
        await capture(page, ".public-markers > div", i, 256),
      );
      manifest.objects.push({
        id: ["early-bird", "year"][i],
        name: ["Early Bird", "Year"][i],
        kind: "token",
        count: 1,
        image,
      });
    }
    await load(page, "agents");
    const pairs = page.locator(".agent-pair");
    const agentDesigns = new Map();
    for (let i = 0; i < (await pairs.count()); i++) {
      const e = pairs.nth(i),
        name = await e.getAttribute("aria-label");
      const portrait = (await e.locator(".portrait").count()) > 0;
      const design = await e.evaluate((node) => node.outerHTML);
      const existing = agentDesigns.get(design);
      if (existing) {
        existing.count++;
        continue;
      }
      const image = asset(
        `agent-${i + 1}`,
        resize(await e.locator(".agent-face").first().screenshot(), 320, 320),
      );
      const imageSecondary = portrait
        ? asset(
            `agent-${i + 1}-asleep`,
            resize(
              await e.locator(".agent-face").nth(1).screenshot(),
              320,
              320,
            ),
          )
        : image;
      const object = {
        id: `agent-${i + 1}`,
        name,
        kind: portrait ? "tile" : "figurine",
        count: 1,
        image,
        imageSecondary,
        width: 320,
        height: 320,
      };
      agentDesigns.set(design, object);
      manifest.objects.push(object);
    }
    await page.goto(
      pathToFileURL(path.join(root, "docs/assets/policy-district-map.svg"))
        .href,
    );
    const svg = page.locator("svg");
    await svg.evaluate((e) => {
      e.style.width = "4096px";
      e.style.height = "auto";
    });
    const image = asset("district-map", await svg.screenshot({ scale: "css" }));
    manifest.objects.unshift({
      id: "district-map",
      name: "Bellwether district map",
      kind: "board",
      count: 1,
      image,
    });
    const sharedFront = manifest.objects.find(
      (o) => o.id === "shared-reference-1",
    );
    const sharedBack = manifest.objects.find(
      (o) => o.id === "shared-reference-2",
    );
    sharedFront.name = "Shared player reference";
    sharedFront.imageSecondary = sharedBack.image;
    manifest.objects = manifest.objects.filter((o) => o !== sharedBack);
    fs.writeFileSync(
      path.join(out, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    console.log(
      `Exported ${manifest.decks.length} decks, ${manifest.decks.reduce((n, d) => n + d.count, 0)} cards, ${manifest.objects.length} object types.`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
