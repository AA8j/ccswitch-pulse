import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";

const mode = process.argv[2] || "check";
const sourcePaths = [
  "public/app.js", "public/index.html", "public/styles.css", "public/i18n.js",
  "public/theme.js", "src/demo.js", "src/report.js", "scripts/capture-readme.js",
];
const ids = ["zh", "en"].flatMap((lang) => ["dark", "light"].flatMap((theme) => [
  ...["dashboard", "report", "share"].map((kind) => `${kind}-${theme}-${lang}`),
  ...(theme === "dark" ? [`date-range-${theme}-${lang}`] : []),
]));
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = createHash("sha256");
// Git may check text out as CRLF on Windows. Fingerprint equivalent sources
// identically; PNG hashes still cover their exact binary bytes.
for (const path of sourcePaths) source.update(path).update("\0").update((await readFile(path, "utf8")).replace(/\r\n/g, "\n")).update("\0");
const sourceFingerprint = source.digest("hex");

function pngInfo(bytes, id) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${id}: invalid PNG`);
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR", `${id}: missing PNG dimensions`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (id.startsWith("dashboard")) assert.ok(width >= 3200 && height >= 2200, `${id}: chart would be cropped or low resolution`);
  if (id.startsWith("report")) assert.ok(width >= 2400 && height >= 900, `${id}: report is too small`);
  if (id.startsWith("share")) assert.ok(width === 2400 && height === 1350, `${id}: incorrect export dimensions`);
  if (id.startsWith("date-range")) assert.ok(width >= 1500 && height >= 750, `${id}: date picker is too small`);
  return { width, height, sha256: digest(bytes) };
}

if (mode === "prepare") {
  await mkdir("output/playwright/readme", { recursive: true });
  const template = await readFile("scripts/capture-readme.js", "utf8");
  assert.ok(template.includes("__CAPTURE_SOURCE_FINGERPRINT__"));
  await writeFile("output/playwright/readme/capture-prepared.js", template.replace("__CAPTURE_SOURCE_FINGERPRINT__", sourceFingerprint));
  console.log("Prepared demo-only capture at output/playwright/readme/capture-prepared.js");
} else if (mode === "publish") {
  const metadata = JSON.parse(await readFile("output/playwright/readme/capture-meta.json", "utf8"));
  assert.equal(metadata.demo, true, "Refusing non-demo documentation images");
  assert.equal(metadata.appVersion, version, "Captured app version is stale; restart the demo server and recapture");
  assert.equal(metadata.sourceFingerprint, sourceFingerprint, "UI changed since capture was prepared; recapture images");
  const images = [];
  // Validate every candidate before modifying published assets or README links.
  for (const id of ids) {
    const bytes = await readFile(`output/playwright/readme/${id}.png`);
    const info = pngInfo(bytes, id);
    images.push({ id, path: `docs/images/${id}-${info.sha256.slice(0, 12)}.png`, ...info, bytes });
  }
  for (const image of images) await writeFile(image.path, image.bytes);
  for (const name of ["README.md", "README.en.md"]) {
    let text = await readFile(name, "utf8");
    for (const image of images) text = text.replaceAll(new RegExp(`docs/images/${image.id}(?:-[a-f0-9]{12})?\\.png`, "g"), image.path);
    await writeFile(name, text);
  }
  await writeFile("docs/images/manifest.json", JSON.stringify({
    ...metadata,
    images: images.map(({ bytes, ...entry }) => entry),
  }, null, 2) + "\n");
  const published = new Set(images.map((image) => image.path.split("/").at(-1)));
  for (const file of await readdir("docs/images")) {
    if (/^(?:dashboard|report|share|date-range)-(?:dark|light)-(?:zh|en)(?:-[a-f0-9]{12})?\.png$/.test(file) && !published.has(file)) await unlink(`docs/images/${file}`);
  }
  console.log(`Published ${images.length} verified, content-addressed images for v${version}.`);
} else if (mode === "check") {
  const manifest = JSON.parse(await readFile("docs/images/manifest.json", "utf8"));
  assert.equal(manifest.appVersion, version, "README images do not match the current app version");
  assert.equal(manifest.demo, true, "README images must use demo data");
  assert.equal(manifest.sourceFingerprint, sourceFingerprint, "README images are stale after a UI or demo change");
  assert.deepEqual(manifest.images.map((image) => image.id).sort(), [...ids].sort(), "Missing or duplicated image variants");
  const paths = new Set();
  for (const image of manifest.images) {
    const expected = `docs/images/${image.id}-${image.sha256.slice(0, 12)}.png`;
    assert.equal(image.path, expected, "Image filename must include its content hash");
    const info = pngInfo(await readFile(expected), image.id);
    assert.deepEqual(info, { width: image.width, height: image.height, sha256: image.sha256 }, `${image.id}: image hash or dimensions changed`);
    paths.add(expected);
  }
  for (const name of ["README.md", "README.en.md"]) {
    const text = await readFile(name, "utf8");
    const referenced = [...text.matchAll(/!\[[^\]]*\]\((docs\/images\/[^)]+)\)/g)].map((match) => match[1]);
    assert.equal(referenced.length, 5, `${name}: expected overview, light theme, report, share and date picker images`);
    for (const path of referenced) assert.ok(paths.has(path), `${name}: broken or stale image reference ${path}`);
    const lang = name === "README.md" ? "zh" : "en";
    for (const image of manifest.images.filter((image) => image.id.endsWith(`-${lang}`))) {
      if (image.id.startsWith("dashboard") || image.id.startsWith("date-range") || image.id.includes("-light-")) assert.ok(referenced.includes(image.path), `${name}: missing ${image.id}`);
    }
  }
  console.log(`README image check passed: ${manifest.images.length} PNGs, both READMEs, v${version}, current UI fingerprint.`);
} else {
  throw new Error("Usage: node scripts/readme-images.mjs prepare|publish|check");
}
