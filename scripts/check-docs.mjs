import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = join(repositoryRoot, "docs");
const archiveRoot = join(repositoryRoot, "archive");
const indexPath = join(docsRoot, "index.html");
const errors = [];
const generatedPrintOutputs = new Set([
  "lobbying-firm-boards-a4.pdf",
  "lobbying-firm-tokens-a4.pdf",
  "operation-tokens-a4.pdf",
  "party-boards-a4.pdf",
  "pecking-order-a4.pdf",
  "ring-and-cross-district-map-a3.pdf",
  "scoring-cards-a4.pdf",
].map((name) => join(repositoryRoot, "assets", "print", name)));

function collectHtmlFiles(directory) {
  return readdirSync(directory)
    .map((name) => join(directory, name))
    .flatMap((entry) => statSync(entry).isDirectory() ? collectHtmlFiles(entry) : [entry])
    .filter((entry) => extname(entry) === ".html");
}

function displayPath(file) {
  return relative(repositoryRoot, file);
}

function extractAttributeValues(source, attribute) {
  const pattern = new RegExp(
    `\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,
    "gi",
  );
  return [...source.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3]);
}

function extractIds(source) {
  return extractAttributeValues(source, "id");
}

function resolveReference(fromFile, reference) {
  const [pathPart, fragment] = reference.split("#", 2);
  const target = pathPart ? resolve(dirname(fromFile), decodeURIComponent(pathPart)) : fromFile;
  return { target, fragment: fragment ? decodeURIComponent(fragment) : "" };
}

function checkDocument(file, source) {
  if (!/^<!doctype html>/i.test(source.trimStart())) {
    errors.push(`${displayPath(file)}: missing HTML doctype`);
  }

  if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(source)) {
    errors.push(`${displayPath(file)}: missing document language`);
  }

  if (!/<meta\b[^>]*\bname=["']viewport["'][^>]*>/i.test(source)) {
    errors.push(`${displayPath(file)}: missing viewport metadata`);
  }

  if (!/<title>[^<]+<\/title>/i.test(source)) {
    errors.push(`${displayPath(file)}: missing non-empty title`);
  }

  const headings = source.match(/<h1\b/gi) ?? [];
  if (headings.length !== 1) {
    errors.push(`${displayPath(file)}: expected one h1, found ${headings.length}`);
  }

  const ids = extractIds(source);
  for (const id of new Set(ids)) {
    if (ids.filter((candidate) => candidate === id).length > 1) {
      errors.push(`${displayPath(file)}: duplicate id "${id}"`);
    }
  }
}

function checkReference(fromFile, reference, sources) {
  if (
    !reference ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference) ||
    reference.startsWith("?")
  ) {
    return;
  }

  const { target, fragment } = resolveReference(fromFile, reference);
  if (!existsSync(target)) {
    if (generatedPrintOutputs.has(target)) {
      return;
    }
    errors.push(`${displayPath(fromFile)}: unresolved reference "${reference}"`);
    return;
  }

  if (fragment && extname(target) === ".html") {
    const targetSource = sources.get(target) ?? readFileSync(target, "utf8");
    if (!extractIds(targetSource).includes(fragment)) {
      errors.push(`${displayPath(fromFile)}: missing fragment "${fragment}" in ${displayPath(target)}`);
    }
  }
}

const htmlFiles = [docsRoot, archiveRoot].flatMap(collectHtmlFiles);
const sources = new Map(htmlFiles.map((file) => [file, readFileSync(file, "utf8")]));

for (const [file, source] of sources) {
  checkDocument(file, source);
  const references = [
    ...extractAttributeValues(source, "href"),
    ...extractAttributeValues(source, "src"),
  ];
  for (const reference of references) {
    checkReference(file, reference, sources);
  }
}

const reachable = new Set();
const queue = [indexPath];

while (queue.length > 0) {
  const file = queue.shift();
  if (reachable.has(file) || !sources.has(file)) {
    continue;
  }

  reachable.add(file);
  for (const reference of extractAttributeValues(sources.get(file), "href")) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(reference)) {
      continue;
    }

    const { target } = resolveReference(file, reference);
    if (extname(target) === ".html" && !reachable.has(target)) {
      queue.push(target);
    }
  }
}

for (const file of htmlFiles) {
  if (!reachable.has(file)) {
    errors.push(`${displayPath(file)}: not reachable from docs/index.html`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked ${htmlFiles.length} HTML files; all local references and document invariants pass.\n`);
}
