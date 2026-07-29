#!/usr/bin/env node

const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

let chromium;

try {
  ({ chromium } = require("playwright"));
} catch {
  process.stderr.write(
    "Playwright is unavailable. Install it locally or globally with its Chromium browser.\n",
  );
  process.exit(1);
}

const exportArguments = process.argv.slice(2);

if (exportArguments.length === 0 || exportArguments.length % 2 !== 0) {
  process.stderr.write("Expected one or more source/output path pairs.\n");
  process.exit(1);
}

async function exportPage(page, sourcePath, outputPath) {
  const failedRequests = [];
  const pageErrors = [];

  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(pathToFileURL(resolve(sourcePath)).href, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);

  if (failedRequests.length > 0 || pageErrors.length > 0) {
    throw new Error([...failedRequests, ...pageErrors].join("\n"));
  }

  await page.pdf({
    path: resolve(outputPath),
    displayHeaderFooter: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
    printBackground: true,
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    for (let index = 0; index < exportArguments.length; index += 2) {
      const page = await browser.newPage();

      try {
        await exportPage(page, exportArguments[index], exportArguments[index + 1]);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
