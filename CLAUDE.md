# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mermaid Flow is an Obsidian community plugin: a visual WYSIWYG editor for Mermaid
flowcharts. TypeScript in `src/` is bundled by esbuild into a single `main.js`
that Obsidian loads. The repo lives *inside* a real vault at
`.obsidian/plugins/obsidian-mermaid-flow/`, so a `dev`/`build` writes `main.js`
into the very Obsidian instance that will run it — reload the plugin (or use
hot-reload) to test changes against this vault.

## Commands

```bash
npm run dev       # esbuild watch mode → rebuilds main.js on change (no typecheck)
npm run build     # tsc -noEmit typecheck + minified production bundle
npm run lint      # eslint over src/**/*.ts (relies on shell globbing the paths)
npm run validate  # assert manifest.json version === package.json version + required fields
npm version <v>   # runs version-bump.mjs → syncs manifest.json + versions.json, stages them
```

CI (`.github/workflows/ci.yml`) runs exactly `validate` → `lint` → `build` on
push/PR to `main`. There is **no test suite** — those three are the full check
set; run them before considering a change done. Pushing a git **tag** triggers
`release.yml`, which builds and attaches `main.js`, `manifest.json`, `styles.css`
to a GitHub release.

`@typescript-eslint/no-explicit-any` is off; `tsconfig.json` is otherwise
`strict` (incl. `noUncheckedIndexedAccess`), so expect to guard array/Map access.

## Architecture

### The round-trip core

The plugin is a visual wrapper around Mermaid text. Everything centers on one
in-memory shape, `DiagramModel` (`src/model.ts`), and converting to/from it:

```
Mermaid text ──parser.ts──▶ DiagramModel ──serializer.ts──▶ Mermaid text
                            (editor mutates
                             this in place)
```

- **`parser.ts`** — line-based, regex-driven, deliberately *forgiving*. It only
  understands the common flowchart subset. **Critical invariant:** any line it
  cannot interpret (classDef, click bindings, unknown directives, comments) is
  pushed verbatim into `model.extras` and re-emitted on save, so the visual
  editor never corrupts a user's advanced syntax. Preserve this when extending
  the parser — add real handling *or* let it fall through to `extras`, never drop.
- **`serializer.ts`** — `DiagramModel` → Mermaid, plus a `%% mermaid-flow:pos
  A=x,y[,w,h] …` comment that persists manual node positions (Mermaid ignores
  `%%` lines, so it stays valid). The parser reads this comment back. Gated by
  the `savePositions` setting / `includePositions` option.
- **`layout.ts`** — rank-based auto layout, used when parsed nodes have no saved
  positions (`layoutMissing`) or on explicit "Auto layout".

`model.ts` also holds all enum tables (`NodeShape`, `EdgeKind`, `Direction`) with
parallel `*_LABELS` maps, and model mutators (`removeNode`, `assignNodeToGroup`,
`cloneModel` for cancel/undo, id generators: nodes `A,B,…,N1,N2`; groups `sub1…`).

### Three edit entry points, one editor

`main.ts` (the `Plugin` subclass) wires three ways to start editing, which all
converge on `openEditor` → either a Modal or a pane:

1. **Editor commands / ribbon** — cursor-based. `editorBridge.ts` finds the
   `mermaid` block enclosing the cursor and writes back via the `Editor` API.
   Because the document can shift while the editor is open, `relocateBlock`
   re-scans a ±5-line window for the fence before replacing on save.
2. **Reading mode** — `registerMarkdownPostProcessor` adds an Edit/Code overlay.
   A `MutationObserver` re-attaches the overlay because Mermaid renders async and
   wipes it. Write-back uses `vault.process` (no live editor) against source
   lines from `ctx.getSectionInfo`.
3. **Live Preview** — `getSectionInfo` returns null for CM6 block widgets, so
   `editorExtension.ts` (a CM6 `ViewPlugin`) instead scans the doc for fences,
   watches the DOM for `.cm-embed-block` embeds, maps each back to a source line
   range via `posAtDOM`, and injects the same overlay. Line ranges come straight
   from editor state, so write-back is reliable.

Note: the opening-fence regex (`OPEN_FENCE_RE`) is **duplicated** in `main.ts`,
`editorBridge.ts`, and `editorExtension.ts` — keep them in sync if you change it.

### The visual editor (host-agnostic)

`DiagramEditorUI` (`editorUI.ts`, the largest file) is the whole editor —
toolbar, canvas, properties panel, raw-code view, undo/redo, autosave — and
renders into *any* container. It's hosted two ways behind the `EditorHost`
interface (`persist`/`close`/`autoSave`/`closeOnSave`):

- `editorModal.ts` — popup (`Modal`)
- `editorView.ts` — embedded workspace pane (`ItemView`, `VIEW_TYPE_MERMAID_FLOW`)

The `openMode` setting picks which. Autosave (debounced `persist`) applies only
to the embedded pane editing an existing block.

`canvas.ts` (`DiagramCanvas`) is the SVG interaction surface: drag, connect,
rubber-band multi-select, resize, subgraph drag. It **mutates the model in place**
and reports via `CanvasCallbacks` (`onSelect`/`onChange`/`onContextMenu`).
**Convention:** `node.x`/`node.y` are the node *centre*, not top-left.
`shapes.ts` builds the SVG geometry per `NodeShape` and the toolbar shape icons.
`presets.ts` maps draw.io-style choices (themes, layouts, semantic node roles)
onto Mermaid `theme`/`themeVariables`/direction/shape+style.

## Conventions & gotchas

- **`isDesktopOnly: false`** — keep runtime code mobile-safe: no Node/Electron
  APIs at runtime. (`@types/node`, `node:module`, `process` appear only in
  build/config scripts, which esbuild marks external — never `import` them from
  `src/`.)
- **Version sync is enforced.** `manifest.json` and `package.json` versions must
  match (CI fails otherwise). Use `npm version`; don't hand-edit one alone.
  `versions.json` maps plugin version → minimum Obsidian `minAppVersion`.
- **Build output is git-ignored.** `main.js` is in `.gitignore` (a fresh clone
  must `npm install && npm run build`), but `styles.css` is tracked and shipped.
- Settings persist to `data.json` via Obsidian's `loadData`/`saveData`.
- Styling uses Obsidian CSS variables (e.g. `--text-normal`) so it follows the
  active theme; plugin styles live in `styles.css`.

## Obsidian coding standards (plugin review rules)

These four rules map directly to Obsidian's community plugin audit checks. Violations
block listing. The ESLint config (`eslint.config.mjs`) enforces #2 and #3 locally.

**1. Use `activeDocument` instead of `document`** (popout window compatibility)
```typescript
// WRONG
const g = document.createElementNS(SVG_NS, "g");

// RIGHT — activeDocument is a global provided by Obsidian (no import needed):
const g = activeDocument.createElementNS(SVG_NS, "g");
```
Applies to: `createElementNS`, `createElement`, `activeElement`, and any other
`document.*` call. `activeDocument` is declared as a global by the `obsidian`
package — it is automatically in scope in all `src/` files with no import required.

**2. No direct `.style.*` on SVG elements** (`obsidianmd/no-static-styles-assignment`)

Use SVG presentation attributes instead — they are equivalent and don't trigger the rule:
```typescript
// WRONG
el.style.fill = "#ff0000";
el.style.strokeWidth = "2px";

// RIGHT
el.setAttribute("fill", "#ff0000");
el.setAttribute("stroke-width", "2");   // SVG stroke-width has no px units
el.setAttribute("font-size", "14px");   // text attributes do use px
```
For toggling visibility/cursor on HTML elements, add a CSS class in `styles.css`
and toggle with `classList.add/remove` rather than setting `.style.*` directly.

**3. Always handle promise rejections** (`@typescript-eslint/no-floating-promises`)

Never use the bare `void` operator to discard a promise. Use `.catch()`:
```typescript
// WRONG
void this.openInPane(model, onSave, autoSave);

// RIGHT
this.openInPane(model, onSave, autoSave)
    .catch((e) => console.error("[mermaid-flow]", e));
```

**4. No `!important` in CSS**

Increase selector specificity instead. Since `.modal` is always present on Obsidian
modals, chain it for responsive overrides: `.modal.mermaid-flow-modal { width: ... }`.
For `prefers-reduced-motion`, scope to plugin elements only
(`.mermaid-flow-editor *, .mermaid-flow-modal *`) rather than the global `*` selector.

Deeper write-ups live in `docs/ARCHITECTURE.md` and `docs/CODE_EXPLANATION.md`.

## Testing

```bash
npm test              # run all tests once
npm test -- --watch   # watch mode
npm test -- canvas    # run a single test file by name pattern
```

Tests live in `tests/` and run under Vitest with the `jsdom` environment.
`tests/setup.ts` is the **single place** for all Obsidian global polyfills
(loaded via `vitest.config.ts` `setupFiles`). It currently provides:
`activeDocument`, `activeWindow`, `HTMLElement.prototype.createDiv/createEl/addClass/removeClass/empty`.

**When to update `tests/setup.ts`:**
- You add a call to a new Obsidian global (e.g. `activeWindow.ResizeObserver`)
  in any `src/` file → add the matching polyfill to `tests/setup.ts`.
- You add a new Obsidian HTMLElement helper call in `src/` → add it to the
  `proto.*` block in `tests/setup.ts`.
- Never polyfill inside an individual test file's `beforeAll` — centralise it.

**When to update test files:**
- Any UI change that alters how nodes, edges, or labels render in SVG needs
  a corresponding assertion update in `canvas.test.ts`.
- New rendering paths (new shapes, new edge types) should add a test case.
- The test file imports `DiagramCanvas` directly and calls `canvas.getSVG()` —
  you can assert on `.querySelector` results against the returned SVGSVGElement.

## Local AI tooling (`.claude/`)

This repo ships Claude Code config so AI-generated changes stay within the audit
rules above. All of it is committed (team-wide).

- **Guard hook** — `.claude/settings.json` registers a `PostToolUse` hook on
  `Write|Edit|MultiEdit` that runs `.claude/hooks/guard-edit.cjs`. After any edit
  it fast-greps the touched file for the four listing-blocking violations (bare
  `document.`, `.style.*` assignment, bare `void` on a promise, CSS `!important`)
  and, on `manifest.json`/`package.json`, runs `validate-manifest.cjs` for version
  sync. A hit is fed back so it's fixed in the same turn. It is a *fast guard*, not
  a substitute for `npm run lint && npm run build` — run those before "done".
  (Plain Node, no jq dependency. Edits to `.claude/settings.json` only take effect
  after `/hooks` reload or a restart.)
- **`plugin-auditor` agent** (`.claude/agents/`) — on-demand deep audit before a
  commit/PR/release: reviews the diff against the four rules, runtime mobile-safety,
  the round-trip invariant, and version sync, then runs validate/lint/build/test.
  Invoke it by asking to "audit before I push".
- **`mermaid-roundtrip` skill** (`.claude/skills/`) — auto-triggers when editing the
  fragile parse↔serialize core (`parser.ts`/`serializer.ts`/`model.ts`/`layout.ts`
  or adding a shape/edge/direction). Encodes the `extras`-preservation invariant and
  the round-trip test loop.
