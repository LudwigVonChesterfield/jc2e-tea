// Chooses a card grid (cols x rows) for a Tabletop Simulator deck sheet,
// balancing wasted cells against staying under the max texture size.
// Ported from dune_board_game/v2's tts_card_generator.py `new_choose_grid`.

const MAX_CARDS = 70; // Tabletop Simulator's limit for a single custom deck.

/**
 * @param {number} numCards
 * @param {number} cardWidth
 * @param {number} cardHeight
 * @param {number} [maxSize] - max sheet dimension (TTS textures cap around 4096-8192px)
 */
export function chooseGrid(numCards, cardWidth, cardHeight, maxSize = 4096) {
  if (numCards > MAX_CARDS) {
    throw new Error(`${MAX_CARDS} is the max number of cards in a single TTS deck. Got ${numCards}.`);
  }

  let best = null;

  for (let rows = 2; rows <= 7; rows++) {
    for (let cols = 2; cols <= 10; cols++) {
      const capacity = cols * rows;
      if (capacity < numCards) continue;

      const empty = capacity - numCards;

      let widthScale = 1.0;
      let heightScale = 1.0;
      if (cardWidth * cols > maxSize) widthScale = maxSize / (cardWidth * cols);
      if (cardHeight * rows > maxSize) heightScale = maxSize / (cardHeight * rows);

      const scale = Math.min(widthScale, heightScale);
      const deformation = Math.abs(1.0 - scale);

      let score = 0;
      score -= empty;
      score -= deformation * 100.0;
      if (cardWidth < cardHeight) score -= 1.0; // prefer wider-than-tall sheets

      if (best === null || score > best.score) {
        best = { score, cols, rows, scale };
      }
    }
  }

  if (best === null) {
    throw new Error(`Could not find a grid fitting ${numCards} cards within ${maxSize}px`);
  }

  const cardWidthFinal = Math.floor(cardWidth * best.scale);
  const cardHeightFinal = Math.floor(cardHeight * best.scale);

  return {
    cols: best.cols,
    rows: best.rows,
    scale: best.scale,
    sheetWidth: cardWidthFinal * best.cols,
    sheetHeight: cardHeightFinal * best.rows,
  };
}
