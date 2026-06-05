# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A visual WYSIWYG editor for Mermaid flowcharts, packaged as an **Obsidian community plugin**. Users drag nodes and draw connections; the plugin reads/writes the underlying ` ```mermaid ` code blocks for them.

This working directory **is a live plugin install** inside an Obsidian vault (`.obsidian/plugins/obsidian-mermaid-flow`). `main.js` is the bundled artifact Obsidian actually loads — `npm run dev` rebuilds it in place, so reloading Obsidian (or using `obsidian-plugin-hot-reload`) picks up changes. `main.js` and `styles.css` are build outputs; edit `src/**` and `styles.css` source, not `main.js`.

## Commands

- `npm run dev` — esbuild watch; rebuilds `main.js` on save (inline sourcemaps).
- `npm run build` — full check: `tsc -noEmit` typecheck **then** minified production bundle. Run this before committing.
- `npm run lint` — ESLint over `src/**/*.ts` (flat config, `typescript-eslint`).
- `npm run validate` — asserts `manifest.json` version equals `package.json` version and required manifest fields exist.
- `npm version <x.y.z>` — bumps version, syncs `manifest.json` + `versions.json` via `version-bump.mjs`, and stages them.

**There is no automated test suite** (no `test` script, no test runner). The CI gate is `validate` → `lint` → `build` (`.github/workflows/ci.yml`); reproduce it locally with those three commands. Tagging a release triggers `release.yml`, which uploads `main.js`, `manifest.json`, `styles.css`.

TypeScript runs in full `strict` mode plus `noUncheckedIndexedAccess` — array/index access is `T | undefined`, which is why the code is heavy on `?? fallback` and explicit index guards. Keep that pattern.

## Architecture

The plugin is a **visual wrapper around Mermaid text**. Everything flows through one round-trip:

```
Mermaid text  --parser.ts-->  DiagramModel  --serializer.ts-->  Mermaid text
                                  ^   |
                                  |   v
                         DiagramEditorUI / DiagramCanvas (visual edits)
```

- **`model.ts`** — `DiagramModel` (nodes, edges, groups/subgraphs, config, `extras`) is the single source of truth. The visual editor mutates it in place; `cloneModel` is used for undo/cancel snapshots.
- **`parser.ts`** — line/regex-based Mermaid→Model (no Mermaid lib dependency). **`serializer.ts`** — Model→Mermaid, the inverse.
- **`layout.ts`** — rank-based auto-layout when a diagram has no saved positions or the user clicks "Auto layout".
- **`canvas.ts`** — the SVG editing surface (drag, connect, select, resize). **`node.x`/`node.y` are the node CENTRE.** **`shapes.ts`** is the single source of shape geometry, shared by the canvas and the palette icons.
- **`editorUI.ts`** — the host-agnostic editor (toolbar + canvas + properties panel + raw-code view + undo/redo). Hosted via the `EditorHost` interface.
- **`presets.ts`** — the single source of dropdown options (`THEME_PRESETS`, `DIRECTIONS`, `STYLE_PRESETS`, `LAYOUT_PRESETS`, `SPACING_PRESETS`), shared by `editorUI.ts` and `settings.ts`. Add a preset here, not in the consumers.
- **`settings.ts`** — the settings tab + defaults. Settings flow outward: `openMode`/`toolbarStyle` are read by `main.ts` when opening a host; `defaultDirection`/`defaultNodeShape` seed new diagrams; `savePositions` gates the serializer; `autoSave` gates the embedded pane only.

### Two invariants to protect when editing parser/serializer

1. **Lossless round-trip.** Any line the parser does not understand (e.g. `classDef`, `click`, `direction`) is preserved in `model.extras` and re-emitted verbatim on save. Never drop unknown syntax. When adding support for a construct, move it out of `extras` and into a real model field on *both* sides.
2. **Position persistence.** Mermaid has no node coordinates. Manual layout is stored in a self-authored comment `%% mermaid-flow:pos A=x,y[,w,h] ...` that the parser reads and the serializer writes (gated by the `savePositions` setting). Mermaid ignores `%%` lines, so the diagram still renders.

Diagram-level Mermaid config (`theme`, spacing) round-trips through a `%%{init: {...}}%%` directive.

### Obsidian integration: three ways to locate a Mermaid block

This is the subtle part — the same ` ```mermaid ` block is found differently per render context, all wired in `main.ts`:

- **Reading mode** → `registerMarkdownPostProcessor` adds the Edit/Code overlay using `ctx.getSectionInfo`. Mermaid renders async and can wipe the overlay, so a short-lived `MutationObserver` re-attaches it (`addEditButton` / `attachOverlay`).
- **Live Preview** → `getSectionInfo` returns null here, so a CM6 `ViewPlugin` (`editorExtension.ts`) instead scans the doc for fences and maps rendered `.cm-embed-block` DOM nodes back to source line ranges via `posAtDOM`.
- **Source mode + commands/ribbon** → `editorBridge.ts` walks fences around the cursor.

### Write-back must survive edits made while the editor is open

The user can edit the note while the visual editor is open, shifting line numbers. So saving re-locates the block first:
- editor-based paths use `relocateBlock` (searches a small window around the original fence line) then `editor.replaceRange`;
- the reading-mode path uses `app.vault.process(file, ...)` with line slices.

### One editor UI, two hosts

`DiagramEditorUI` is rendered into either:
- **`editorModal.ts`** — popup `Modal`, or
- **`editorView.ts`** — embedded `ItemView` pane (`VIEW_TYPE_MERMAID_FLOW`).

The `openMode` setting picks which. **Auto-save applies only to the embedded pane when editing an existing diagram** — not the popup, not new-diagram insertion.

`EditorHost` lets the host relocate the Save/Discard actions: when it passes an `actionsSlot` element (the modal removes the native close X and supplies its title bar), `editorUI.ts` renders them there as icon buttons; otherwise they dock in the toolbar as text buttons. Tooltips come from `aria-label` alone — do **not** also set `title` or call `setTooltip`, or buttons show two overlapping tooltips.

## Conventions

- Use Obsidian DOM helpers (`createDiv`, `createEl`, `setIcon`, `addClass`) rather than raw DOM, matching the existing code.
- Styles live in `styles.css` and must use Obsidian theme CSS variables (e.g. `--text-normal`, `--background-modifier-border`) so the plugin follows the user's theme.
- esbuild marks `obsidian`, `electron`, `@codemirror/*`, and `@lezer/*` as externals — they are provided by Obsidian at runtime; do not bundle them.
- Settings persist to `data.json` via `loadData`/`saveData`.

See `docs/ARCHITECTURE.md` and `docs/CODE_EXPLANATION.md` for the author's own notes.
