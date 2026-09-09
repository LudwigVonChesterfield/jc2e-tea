#!/usr/bin/env node
// Renders each print-and-play deck page (src/pages/components/decks/[deck]/index.astro)
// to a PDF, the same way the manual "Print to PDF from Chrome" workflow described in
// src/content/decks/_print-notice.md works, just automated.
//
// Usage:
//   node scripts/build-pdfs.mjs [--decks acts,events] [--out-dir <dir>] [--preview] [--port 4319] [--skip-build]
//
// Runs against the Astro dev server by default (fast, and unaffected by
// unrelated content errors elsewhere in the site). Pass --preview to build
// the full production site and serve that instead - slower, and will fail
// if *any* page in the site fails to build, but matches deployed output.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "./lib/server.mjs";
import { DECK_IDS, PDF_FILENAMES } from "./lib/decks.mjs";
import { getDeckBackMode, isLandscapeBackMode } from "./lib/frontmatter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { decks: null, outDir: null, preview: false, port: 4319, skipBuild: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--decks") args.decks = argv[++i].split(",").map((s) => s.trim());
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--preview") args.preview = true;
    else if (arg === "--skip-build") args.skipBuild = true;
    else if (arg === "--port") args.port = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8")).version;
  const outDir = args.outDir ?? path.join(PROJECT_ROOT, "public/pnp", version);
  const deckIds = args.decks ?? DECK_IDS;

  fs.mkdirSync(outDir, { recursive: true });

  const server = await startServer({
    mode: args.preview ? "preview" : "dev",
    port: args.port,
    skipBuild: args.skipBuild,
  });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    for (const deckId of deckIds) {
      const backMode = getDeckBackMode(deckId);
      const landscape = isLandscapeBackMode(backMode);
      const url = `${server.baseUrl}components/decks/${deckId}/`;
      const outFile = path.join(outDir, `${PDF_FILENAMES[deckId] ?? deckId}.pdf`);

      console.log(`Rendering ${deckId} (${landscape ? "landscape" : "portrait"}) -> ${path.relative(PROJECT_ROOT, outFile)}`);
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector(`#deck-${deckId} .card-list`);
      // The Astro dev toolbar is dev-only chrome injected into the page; make
      // sure it never ends up in a print capture.
      await page.addStyleTag({ content: "astro-dev-toolbar { display: none !important; }" });

      await page.pdf({
        path: outFile,
        format: "A4",
        landscape,
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      });
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log(`\nDone. PDFs written to ${path.relative(PROJECT_ROOT, outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
