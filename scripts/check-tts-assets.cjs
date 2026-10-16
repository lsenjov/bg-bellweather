#!/usr/bin/env node
const fs = require("node:fs");
const { physicalSize } = require("./tts-physical-sizes.cjs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const output = path.resolve(__dirname, "../assets/tts");
const m = JSON.parse(fs.readFileSync(path.join(output, "manifest.json")));
function assert(ok, message) {
  if (!ok) throw Error(message);
}
assert(m.schemaVersion === 1, "Unsupported manifest version");
for (const item of [...m.decks, ...m.objects]) {
  assert(JSON.stringify(item.physicalSizeMm) === JSON.stringify(physicalSize(item)),
    `Incorrect physical dimensions: ${item.id}`);
}
const files = new Map(m.files.map((f) => [f.path, f]));
assert(files.size === m.files.length, "Duplicate asset paths");
assert(
  new Set(m.files.map((f) => f.sha256)).size === m.files.length,
  "Identical asset bytes should share one image",
);
const referencedImages = new Set();
for (const deck of m.decks) {
  referencedImages.add(deck.face.path);
  referencedImages.add(deck.back.path);
}
for (const object of m.objects) {
  referencedImages.add(object.image.path);
  if (object.imageSecondary) referencedImages.add(object.imageSecondary.path);
}
assert(
  referencedImages.size === files.size &&
    [...files.keys()].every((file) => referencedImages.has(file)),
  "Manifest contains unreferenced images",
);
for (const f of m.files) {
  assert(
    !path.isAbsolute(f.path) && !f.path.split("/").includes(".."),
    "Unsafe file path",
  );
  const b = fs.readFileSync(path.join(output, f.path));
  assert(b.length === f.bytes, `${f.path}: byte count`);
  assert(
    crypto.createHash("sha256").update(b).digest("hex") === f.sha256,
    `${f.path}: hash`,
  );
  assert(b.subarray(1, 4).toString() === "PNG", `${f.path}: PNG signature`);
  assert(
    b.readUInt32BE(16) === f.width && b.readUInt32BE(20) === f.height,
    `${f.path}: dimensions`,
  );
  assert(f.width <= 4096 && f.height <= 4096, `${f.path}: exceeds 4096`);
}
assert(m.decks.length === 16, "Expected 16 suit decks");
assert(m.decks.reduce((n, d) => n + d.count, 0) === 151, "Expected 151 cards");
const expected = {
  "operation-cards": 54,
  "bonus-cards": 18,
  "firm-cards": 31,
  "reward-cards": 6,
  policies: 30,
  priorities: 12,
};
for (const [category, count] of Object.entries(expected))
  assert(
    m.decks
      .filter((d) => d.category === category)
      .reduce((n, d) => n + d.count, 0) === count,
    `Incorrect ${category} inventory`,
  );
for (const d of m.decks) {
  assert(d.width <= 10 && d.height <= 7, "Deck grid exceeds TTS limit");
  assert(d.width * d.height > d.count, "Missing hidden slot");
  assert(
    d.backIsHidden === true && d.uniqueBack === false,
    "Expected shared hidden back",
  );
  assert(
    d.cards.length === d.count && d.cards.every((c, i) => c.index === i),
    "Incorrect card indices",
  );
  for (const ref of [d.face, d.back])
    assert(
      files.has(ref.path) && ref.url === m.baseUrl + ref.path,
      "Missing image or inconsistent URL",
    );
}
const count = (kind) =>
  m.objects.filter((o) => o.kind === kind).reduce((n, o) => n + o.count, 0);
assert(count("opening-marker") === 12, "Expected 12 opening markers");
assert(
  m.objects.filter((o) => o.kind === "opening-marker").length === 6,
  "Expected one opening-marker design per firm",
);
assert(
  m.objects.filter((o) => o.id.startsWith("small-token-")).length === 3,
  "Expected favour, history, and trap token designs",
);
assert(
  m.objects.filter((o) => o.kind === "figurine").length === 9,
  "Expected nine distinct standee designs",
);
assert(
  m.objects.filter((o) => o.id.startsWith("agent-") && o.kind === "tile")
    .length === 1,
  "Expected one portrait design with six copies",
);
assert(count("figurine") === 15, "Expected 15 standees");
assert(
  m.objects
    .filter((o) => o.id.startsWith("agent-") && o.kind === "tile")
    .reduce((n, o) => n + o.count, 0) === 6,
  "Expected six portraits",
);
assert(count("tile") === 54, "Expected six portraits and 48 private reminders");
for (const portrait of m.objects.filter(
  (o) => o.id.startsWith("agent-") && o.kind === "tile",
)) {
  assert(
    portrait.imageSecondary &&
      portrait.image.path !== portrait.imageSecondary.path,
    "Portrait awake/asleep faces must differ",
  );
}
assert(
  m.objects.filter((o) => o.id.startsWith("player-folio-")).length === 12,
  "Expected 12 player folio faces",
);
const sharedReference = m.objects.find((o) => o.id === "shared-reference-1");
assert(sharedReference?.imageSecondary, "Shared reference must have two faces");
assert(count("token") === 15, "Expected 13 firm tokens and two public markers");
assert(
  count("reference") === 7,
  "Expected six firm references and double-sided shared aid",
);
assert(
  !m.objects.some((o) => o.id.startsWith("score-ledger")),
  "Score ledger is excluded from TTS",
);
for (const o of m.objects)
  for (const ref of [o.image, o.imageSecondary].filter(Boolean))
    assert(
      files.has(ref.path) && ref.url === m.baseUrl + ref.path,
      "Missing object image or URL",
    );
execFileSync("python", [
  "-c",
  `import json,sys\nfrom pathlib import Path\nfrom PIL import Image,ImageChops\np=Path(sys.argv[1]);m=json.loads((p/'manifest.json').read_text())\nfor d in m['decks']:\n im=Image.open(p/d['face']['path']).convert('RGB');back=Image.open(p/d['back']['path']).convert('RGB');w,h=back.size\n assert im.size==(w*d['width'],h*d['height']),d['id']+' atlas cell dimensions'\n slot=im.crop((im.width-w,im.height-h,im.width,im.height))\n assert ImageChops.difference(slot,back).getbbox() is None,d['id']+' hidden slot differs from back'`,
  output,
]);
console.log(
  "TTS inventory, hashes, dimensions, URLs, grids and hidden backs pass.",
);
