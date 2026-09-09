// Central registry of the printable card decks (src/content/decks/*.mdx).
// Update this if a deck is added, removed, or renamed.

/** @type {string[]} */
export const DECK_IDS = ["acts", "events", "office", "scenario", "setup", "smuggler"];

// Output filenames for the print-and-play PDFs, matching the existing
// files under public/pnp/<version>/ so regenerating doesn't churn names.
export const PDF_FILENAMES = {
  acts: "board-of-trade-deck",
  events: "event-deck",
  office: "office-cards",
  scenario: "scenario-cards",
  setup: "setup-cards",
  smuggler: "smuggler-deck",
};

// DeckTTSLayout.astro combines some decks' cards onto a single TTS sheet
// (see the `combined` array in that component). Visiting the TTS page for
// any id in a group renders the exact same combined card list, so we only
// need to render/export it once per group, under the canonical id.
export const TTS_GROUPS = {
  office: "scenario",
  scenario: "scenario",
};

// Per-deck TTS scale (scaleX/scaleZ; scaleY stays 1), matched to the sizes
// already calibrated by hand in the "1733 Colonial Tea - Trouble Brewing"
// save (Saves/John Company/TS_Save_2261.json): read off each deck object's
// own Transform, except "scenario" which came from the "Consignor of Tea"
// card (an office card pulled out of that combined deck onto the table).
export const TTS_SCALES = {
  acts: 1.2,
  events: 0.775,
  office: 1.25,
  scenario: 1.25,
  setup: 0.825,
  smuggler: 1.15,
};

export function ttsCanonicalId(deckId) {
  return TTS_GROUPS[deckId] ?? deckId;
}

/** Unique canonical ids to actually visit for TTS export, preserving first-seen order. */
export function uniqueTtsDeckIds(deckIds = DECK_IDS) {
  const seen = new Set();
  const result = [];
  for (const id of deckIds) {
    const canonical = ttsCanonicalId(id);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }
  return result;
}
