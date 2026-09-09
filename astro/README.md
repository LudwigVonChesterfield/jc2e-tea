# Starlight Starter Kit: Basics

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

```
npm create astro@latest -- --template starlight
```

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/withastro/starlight/tree/main/examples/basics)
[![Open with CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/sandbox/github/withastro/starlight/tree/main/examples/basics)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/withastro/starlight&create_from_path=examples/basics)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwithastro%2Fstarlight%2Ftree%2Fmain%2Fexamples%2Fbasics&project-name=my-starlight-docs&repository-name=my-starlight-docs)

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🏃 Running the site

**Option A - Node directly** (from this `astro/` directory):

```
npm install
npm run dev
```

Then open **http://localhost:1733/jc2e-tea/** (the port and base path are set in `astro.config.mjs`, not Astro's usual 4321 default).

**Option B - Docker**, from the repo root, using the `Makefile`:

```
make serve
```

This runs `docker compose up` plus `npm install`/`npm run dev` inside the container for you, serving the same `http://localhost:1733/jc2e-tea/`. Other targets: `make down` (stop), `make shell` (shell into the container), `make dist` (production build to `astro/dist/`).

Either way, `npm run dev` starts Astro's dev server, which live-reloads: editing any card's `.mdx` file under `src/content/cards/` (or a deck under `src/content/decks/`) updates the browser in a second or two without a restart. To iterate on one card in isolation rather than a whole deck grid, open its own page directly: `/jc2e-tea/components/cards/<deck>/<card-name>/` (e.g. `/jc2e-tea/components/cards/acts/tea-act/`) - though this route only exists for cards/decks with `page: true` (or the deck's `pages.card: true`) set in frontmatter; for decks without that (e.g. `office`), preview changes on the deck page itself, `/jc2e-tea/components/decks/<deck>/`.

## 🚀 Project Structure

Inside of your Astro + Starlight project, you'll see the following folders and files:

```
.
├── public/
├── src/
│   ├── assets/
│   ├── content/
│   │   ├── docs/
│   │   └── config.ts
│   └── env.d.ts
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

Starlight looks for `.md` or `.mdx` files in the `src/content/docs/` directory. Each file is exposed as a route based on its file name.

Images can be added to `src/assets/` and embedded in Markdown with a relative link.

Static assets, like favicons, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:1733/jc2e-tea/` |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 📦 Export scripts

Two Playwright-driven scripts under `scripts/` automate the manual "print/screenshot the deck pages" workflow, for each deck in `src/content/decks/`:

| Command                | Action                                                                    |
| :---------------------- | :------------------------------------------------------------------------ |
| `npm run export:pdf`   | Renders each deck's print page to a PDF in `public/pnp/<version>/`       |
| `npm run export:tts`   | Renders each deck's TTS page to grid sheets, uploads them to Google Drive, and writes a Tabletop Simulator Saved Object |

Both run against `astro dev` by default (fast, and unaffected by unrelated broken pages elsewhere in the site). Pass `--preview` to build the full production site and serve that instead.

First-time setup:

```
npx playwright install chromium
```

### `export:pdf`

```
node scripts/build-pdfs.mjs [--decks acts,events] [--out-dir <dir>] [--preview] [--port 4319] [--skip-build]
```

Orientation (portrait/landscape) is read from each deck's `pages.deck.back` frontmatter automatically. Output filenames are mapped in `scripts/lib/decks.mjs` (`PDF_FILENAMES`) to match the existing files in `public/pnp/`.

### `export:tts`

```
node scripts/build-tts-sheets.mjs [--decks acts,events] [--no-upload] [--out-dir <dir>] [--preview] [--max-size 4096] [--min-card-width 600] [--save-name <name>]
```

For each deck this measures the rendered card size, picks a grid (cols x rows) that keeps every card readable while staying under Tabletop Simulator's texture size limit, and screenshots the front and back card lists into single sheet images - the same shape as `dune_board_game/v2`'s `tts_card_generator.py`, just screenshotting the site's own HTML/CSS cards instead of exporting from CardMaker. `office` and `scenario` share one combined sheet, matching `DeckTTSLayout.astro`'s existing behavior.

By default it also:
1. Uploads the front/back sheets to a Google Drive folder (making them public), mirroring `upload_to_cloud.py`.
2. Writes a Tabletop Simulator "Saved Object" JSON (one `DeckCustom` per deck) into your TTS `Saved Objects` folder, mirroring `update_in_tts.py` - open it in TTS from *Objects > Saved Objects*.

Pass `--no-upload` to only generate the local sheet images + metadata/instructions files, skipping Drive and the TTS save file (no Google credentials needed).

**One-time Google Drive setup** (needed for the default, uploading mode):
1. In [Google Cloud Console](https://console.cloud.google.com/), enable the Drive API and create an OAuth **Desktop app** client; download its JSON.
2. Create a Drive folder for the sheets and copy its ID from the folder's URL.
3. Copy `scripts/tts.config.example.mjs` to `scripts/tts.config.local.mjs` (gitignored) and fill in the credentials path, folder ID, and your local TTS `Saved Objects` path.
4. Run `npm run export:tts` once - it'll print a URL to open in a browser to authorize; the resulting token is cached at `scripts/.google-token.json` (also gitignored) for future runs.

## 👀 Want to learn more?

Check out [Starlight’s docs](https://starlight.astro.build/), read [the Astro documentation](https://docs.astro.build), or jump into the [Astro Discord server](https://astro.build/chat).
