// Pulls single scalar fields out of a deck's MDX frontmatter without a full
// YAML parser — each field we need happens to be the only line in the file
// literally starting with "<field>:", so a line-anchored regex is enough.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECKS_DIR = path.resolve(__dirname, "../../src/content/decks");

export function readDeckFrontmatterField(deckId, field) {
  const file = path.join(DECKS_DIR, `${deckId}.mdx`);
  const text = fs.readFileSync(file, "utf8");
  const regex = new RegExp(`^\\s*${field}:\\s*"?([^"\\n]+?)"?\\s*$`, "m");
  return text.match(regex)?.[1];
}

export function getDeckName(deckId) {
  return readDeckFrontmatterField(deckId, "name") ?? deckId;
}

export function getDeckBackMode(deckId) {
  return readDeckFrontmatterField(deckId, "back") ?? "vertical-print";
}

export function isLandscapeBackMode(backMode) {
  return backMode.startsWith("horizontal");
}
