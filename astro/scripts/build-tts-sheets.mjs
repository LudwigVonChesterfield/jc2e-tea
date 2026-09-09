#!/usr/bin/env node
// Renders each deck's TTS page (src/pages/components/decks/[deck]/tts.astro)
// into a Tabletop Simulator deck sheet (a grid image of every card front, and
// one of every back), uploads them to Google Drive, and writes a TTS "Saved
// Object" file so the decks show up ready to drag into a game.
//
// This mirrors dune_board_game/v2's tts_card_generator.py + upload_to_cloud.py
// + update_in_tts.py pipeline, except there's no CardMaker export step: the
// cards already render as HTML/CSS, so Playwright screenshots them directly.
//
// Usage:
//   node scripts/build-tts-sheets.mjs [--decks acts,events] [--no-upload]
//     [--out-dir <dir>] [--preview] [--port 4320] [--skip-build]
//     [--max-size 4096] [--min-card-width 600] [--config <path>] [--save-name <name>]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "./lib/server.mjs";
import { chooseGrid } from "./lib/grid.mjs";
import { DECK_IDS, uniqueTtsDeckIds, TTS_SCALES } from "./lib/decks.mjs";
import { getDeckName } from "./lib/frontmatter.mjs";
import { getDriveService, uploadImage, expandHome } from "./lib/google-drive.mjs";
import { generateTtsSave } from "./lib/tts-save.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// DeckTTSLayout.astro combines some decks onto one sheet (see decks.mjs);
// give the combined sheet a name that doesn't just say "Scenario Cards".
const NICKNAME_OVERRIDES = {
  scenario: "Scenario & Office Cards",
};

function parseArgs(argv) {
  const args = {
    decks: null,
    outDir: path.join(PROJECT_ROOT, "..", "tts-export"),
    preview: false,
    port: 4320,
    skipBuild: false,
    maxSize: 4096,
    minCardWidth: 600,
    upload: true,
    config: null,
    saveName: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--decks") args.decks = argv[++i].split(",").map((s) => s.trim());
    else if (arg === "--out-dir") args.outDir = path.resolve(argv[++i]);
    else if (arg === "--preview") args.preview = true;
    else if (arg === "--skip-build") args.skipBuild = true;
    else if (arg === "--port") args.port = Number(argv[++i]);
    else if (arg === "--max-size") args.maxSize = Number(argv[++i]);
    else if (arg === "--min-card-width") args.minCardWidth = Number(argv[++i]);
    else if (arg === "--no-upload") args.upload = false;
    else if (arg === "--config") args.config = path.resolve(argv[++i]);
    else if (arg === "--save-name") args.saveName = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function loadConfig(explicitPath) {
  const candidates = explicitPath
    ? [explicitPath]
    : [path.join(__dirname, "tts.config.local.mjs"), path.join(__dirname, "tts.config.example.mjs")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const mod = await import(`file://${candidate.replace(/\\/g, "/")}`);
      if (candidate.endsWith("tts.config.example.mjs")) {
        console.warn(
          "Using tts.config.example.mjs (placeholder Drive folder ID). " +
            "Copy it to scripts/tts.config.local.mjs and fill in your own values."
        );
      }
      return mod.default;
    }
  }
  throw new Error("No config found. Copy scripts/tts.config.example.mjs to scripts/tts.config.local.mjs and edit it.");
}

async function measureDeck(browser, baseUrl, deckId) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}components/decks/${deckId}/tts`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const lists = page.locator(`#deck-${deckId} .card-list`);
    const frontList = lists.nth(0);
    const backList = lists.nth(1);

    const count = await frontList.locator(".card-front").count();
    if (count === 0) {
      throw new Error(`Deck "${deckId}" has no cards in its TTS card list.`);
    }

    const box = await frontList.locator(".card-front").first().boundingBox();
    const backBox = await backList.locator(".card-back").first().boundingBox();
    if (!box || !backBox) {
      throw new Error(`Could not measure card size for deck "${deckId}".`);
    }

    return { count, cardWidth: box.width, cardHeight: box.height };
  } finally {
    await context.close();
  }
}

async function captureDeckSheets(browser, baseUrl, deckId, layout, frontFile, backFile) {
  const { cols, rows, cardWidth, cardHeight, deviceScaleFactor } = layout;
  const targetWidth = Math.ceil(cols * cardWidth);
  const targetHeight = Math.ceil(rows * cardHeight);

  // Give the viewport generous slack beyond the target grid. The .card-list
  // element's width gets pinned explicitly below, so flex-wrap always
  // produces exactly `cols` columns regardless of surrounding page padding
  // or scrollbars - the viewport just needs to be big enough not to clip it.
  const context = await browser.newContext({
    viewport: { width: targetWidth + 400, height: targetHeight + 400 },
    deviceScaleFactor,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}components/decks/${deckId}/tts`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const lists = page.locator(`#deck-${deckId} .card-list`);
    await lists.evaluateAll((elements, width) => {
      for (const el of elements) {
        el.style.width = `${width}px`;
        el.style.maxWidth = `${width}px`;
      }
    }, targetWidth);

    const frontList = lists.nth(0);
    const backList = lists.nth(1);
    const frontBox = await frontList.boundingBox();
    if (Math.round(frontBox.width) !== targetWidth) {
      throw new Error(
        `Expected .card-list width ${targetWidth}px after pinning, got ${frontBox.width}px for deck "${deckId}".`
      );
    }

    await frontList.screenshot({ path: frontFile });
    await backList.screenshot({ path: backFile });
  } finally {
    await context.close();
  }
}

function writeMetadata(outDir, deckId, deck) {
  const metadataPath = path.join(outDir, `${deckId}_tts_deck_metadata.json`);
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        face_image: path.basename(deck.frontFile),
        back_image: path.basename(deck.backFile),
        num_width: deck.width,
        num_height: deck.height,
        number: deck.number,
        scale: deck.scale,
      },
      null,
      2
    ),
    "utf8"
  );

  const instructionsPath = path.join(outDir, `${deckId}_tts_deck_instructions.txt`);
  fs.writeFileSync(
    instructionsPath,
    `Tabletop Simulator Custom Deck Settings:\n\n` +
      `FaceURL: ${deck.front ?? path.basename(deck.frontFile)}\n` +
      `BackURL: ${deck.back ?? path.basename(deck.backFile)}\n` +
      `Width: ${deck.width}\n` +
      `Height: ${deck.height}\n` +
      `Number: ${deck.number}\n` +
      `UniqueBacks: True\n` +
      `BackIsHidden: True\n` +
      `Scale (X/Z): ${deck.scale}\n`,
    "utf8"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deckIds = uniqueTtsDeckIds(args.decks ?? DECK_IDS);

  fs.mkdirSync(args.outDir, { recursive: true });

  const config = args.upload ? await loadConfig(args.config) : null;

  const server = await startServer({ mode: args.preview ? "preview" : "dev", port: args.port, skipBuild: args.skipBuild });
  const browser = await chromium.launch();
  const generatedDecks = [];

  try {
    for (const deckId of deckIds) {
      console.log(`\n== ${deckId} ==`);
      const { count, cardWidth, cardHeight } = await measureDeck(browser, server.baseUrl, deckId);

      const desiredScale = Math.max(1.0, args.minCardWidth / cardWidth, args.minCardWidth / cardHeight);
      const grid = chooseGrid(count, cardWidth * desiredScale, cardHeight * desiredScale, args.maxSize);
      const deviceScaleFactor = desiredScale * grid.scale;

      console.log(
        `${count} cards -> ${grid.cols}x${grid.rows} grid, sheet ${grid.sheetWidth}x${grid.sheetHeight}px ` +
          `(render scale ${deviceScaleFactor.toFixed(2)})`
      );

      const frontFile = path.join(args.outDir, `${deckId}-front.png`);
      const backFile = path.join(args.outDir, `${deckId}-back.png`);

      await captureDeckSheets(browser, server.baseUrl, deckId, { ...grid, cardWidth, cardHeight, deviceScaleFactor }, frontFile, backFile);
      console.log(`Wrote ${path.relative(PROJECT_ROOT, frontFile)} and ${path.relative(PROJECT_ROOT, backFile)}`);

      const deck = {
        id: deckId,
        name: NICKNAME_OVERRIDES[deckId] ?? getDeckName(deckId),
        frontFile,
        backFile,
        width: grid.cols,
        height: grid.rows,
        number: count,
        scale: TTS_SCALES[deckId] ?? 1,
      };
      generatedDecks.push(deck);
      writeMetadata(args.outDir, deckId, deck);
    }

    if (args.upload) {
      console.log("\nUploading sheets to Google Drive...");
      const drive = await getDriveService(config.googleDrive);

      for (const deck of generatedDecks) {
        const front = await uploadImage(drive, deck.frontFile, { folderId: config.googleDrive.folderId, makePublic: true });
        const back = await uploadImage(drive, deck.backFile, { folderId: config.googleDrive.folderId, makePublic: true });
        deck.front = front.directLink;
        deck.back = back.directLink;
        writeMetadata(args.outDir, deck.id, deck); // refresh instructions.txt with the real URLs
      }

      const saveName = args.saveName ?? config.tts.saveName;
      const savedObjectsPath = expandHome(config.tts.savedObjectsPath);
      const saveFile = path.join(savedObjectsPath, `${saveName}.json`);

      generateTtsSave(generatedDecks, saveName, saveFile);
      console.log(`\nWrote TTS saved object: ${saveFile}`);
      console.log(`In Tabletop Simulator: Games > Saved Objects > "${saveName}".`);
    } else {
      console.log("\n--no-upload set: sheets were generated locally only; no Drive upload or TTS save file was created.");
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log(`\nDone. Local sheets in ${path.relative(PROJECT_ROOT, args.outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
