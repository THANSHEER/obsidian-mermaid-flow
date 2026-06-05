# Mermaid Flow — UI/UX Audit

> Read-only audit of v1.1.0, verified against source. Companion docs:
> [ux-research.md](./ux-research.md), [ui-ux-plan.md](./ui-ux-plan.md).

The existing UI is already competent — theme-variable-driven CSS, focus outlines, reduced-motion
support, and a mobile breakpoint. This audit therefore targets *refinement* (decluttering, first-open,
honest copy, interaction polish), not a rescue.

## How the app opens (first-load + empty state)

- **Entry points** (`src/main.ts`): ribbon icon "Mermaid Flow Editor" → `editOrInsert()`; commands
  `insert-visual-mermaid` → `openInsert()` and `edit-mermaid-visually` → `openEditAtCursor()`;
  reading-mode overlay buttons (`addEditButton`/`attachOverlay`, `main.ts:214-269`); Live-Preview
  overlay buttons (CM6 ViewPlugin, `src/editorExtension.ts`).
- **Host**: the `openMode` setting routes to a popup `Modal` (`editorModal.ts`) or an embedded
  `ItemView` pane (`editorView.ts`). Both mount the same host-agnostic `DiagramEditorUI`
  (`editorUI.ts`).
- **First insert is a blank canvas.** `openInsert` calls `emptyModel()` (`main.ts:145`) → zero nodes.
  A ready-made `starterModel()` with a "Start" node exists (`model.ts:200`) but is **never used**
  (verified: no imports). There is **no on-canvas guidance** when `nodes.length === 0` — just a grid.
- **Embedded-pane empty state** (`editorView.ts:63-69`, `.mermaid-flow-empty`): the only empty-state
  copy, and it is procedural ("Open a Mermaid diagram with the 'Edit Mermaid diagram visually'
  command…").
- **No onboarding/welcome.** Guidance is reactive: a side-panel hint on no-selection
  (`editorUI.ts:793-810`) and a Help modal the user must find (`showHelpDialog`, `editorUI.ts:1459`).

## Component tree (per surface)

- **Editor root** (`editorUI.ts:104-135`): `.mermaid-flow-editor` → `.mermaid-flow-toolbar` →
  `.mermaid-flow-body` ( `.mermaid-flow-canvas-host` + `.mermaid-flow-panel` ) → code view
  (`.mermaid-flow-code-wrap`, hidden) → footer.
- **Toolbar** (`buildToolbar`, `editorUI.ts:218-344`): ~15 icon buttons + 2 selects in one
  `flex-wrap` row, grouped into `.mermaid-flow-tb-group`s with no dividers: History (undo/redo) ·
  Mode (select/connect) · Shape (hover popup) · Layout presets + Lock · Group/Delete · Code/Export ·
  Help · **spacer** · Theme select · Direction select · Close/Save.
- **Properties panel** (`refreshPanel`, `editorUI.ts:789-820`): fixed 240px. Renders per selection —
  none (hint + stats), node (id, label, shape, W×H, style chips, quick-add chips, subgraph,
  text/style section, duplicate/delete), edge (label, kind, style, reverse/delete), group (title,
  ungroup). One long vertical scroll; not collapsible on desktop.
- **Canvas** (`src/canvas.ts`): scroller + SVG with 4 layers (group/edge/node/overlay,
  `canvas.ts:104-111`); CSS 24px grid background; node.x/y = **centre** (`canvas.ts:6`).
- **Context menu** (`showContextMenu`, `editorUI.ts:691-759`): native Obsidian `Menu`, per selection.
- **Modals**: editor Modal (`min(1100px,94vw)×min(800px,90vh)`), Code viewer (`codeModal.ts`), Help.
- **Settings** (`settings.ts`): Open-as, Default direction, Default shape, Auto-save, Remember
  positions, **AI Prompt Template** under a raw `<h3>` "AI & Templates".

## Layout system

Flex column root; the toolbar wraps; the body is a `flex:1` row with a `flex:1` canvas host + a fixed
**240px** panel (`styles.css:247-255`). Code view and footer stack below. Mobile (`max-width:768px`)
stacks to a column and fixes canvas height to 300px. **Nothing is user-resizable**; the panel has no
collapse control on desktop.

## Drag-and-drop / interaction model (`canvas.ts`)

- **Delta-based** pointer dragging via `pointerdown/move/up` on the SVG (`canvas.ts:113-115`) with
  pointer capture. Supported: node drag (single + multi), **Shift-click multi-select**, **rubber-band**
  (>3px threshold), **resize handle** (single node, at right-centre), **drag-to-connect** from hover
  anchors (ghost line) and **click-to-connect** in Connect mode, **group/subgraph drag**.
- **No zoom and no real pan.** Only `pointerdown/move/up` exist — there is **no `wheel`/transform**
  handler (verified). Navigation is native scrollbars (`overflow:auto`). Yet the Help modal claims
  *"Drag to pan the canvas"* and *"Scroll to zoom in/out"* (`editorUI.ts:1488-1489`) — **both false.**
- Visual feedback uses theme accents throughout (selection stroke, rubber-band, ghost line, anchors,
  connect-source). Anchors are invisible until node hover; the cursor does **not** change in Connect
  mode.

## Prioritized UX problems (verified, de-duplicated)

| # | Severity | Problem | Where |
|---|----------|---------|-------|
| 1 | High | First insert = blank grid, **zero on-canvas guidance**; `starterModel` exists but unused | `main.ts:145`, `model.ts:200`, `canvas.ts` render |
| 2 | High | Help modal **documents pan/zoom that don't exist**; "📝 button" reference wrong; missing multi-select/rubber-band tips | `editorUI.ts:1486-1494` |
| 3 | High | **Dead "AI Prompt Template" setting** promises a non-existent AI feature (clutter + false promise) | `settings.ts:20,29,113-128`; `styles.css:742-773` |
| 4 | High | Toolbar = ~15 flat icons + 2 selects, **no group dividers**, wraps awkwardly at mid widths; Theme/Direction shoved past a spacer | `editorUI.ts:218-344`, `styles.css:30-43` |
| 5 | Med | Properties panel is one long scroll, **not sectioned/collapsible**; W×H inputs cramped (64px) | `editorUI.ts:822-1163`, `styles.css:125-133,247-255` |
| 6 | Med | **Connect mode under-discoverable**: anchors hidden until hover, no cursor change, two connect methods unexplained | `canvas.ts:143-148,394-411` |
| 7 | Med | Edit/Code overlay faint (opacity 0.6); embedded-pane empty-state copy is procedural | `styles.css:715-728`, `editorView.ts:65` |
| 8 | Low | Emoji used where Obsidian icons belong (Help `⌨️/🖱️/💡`; code-view error `⚠️`) | `editorUI.ts:1467-1501,~1363` |
| 9 | Low | Color-picker JS default swatches (`#e0e0e0/#ffffff/#888888`) aren't theme-aware (initial swatch only) | `editorUI.ts:1031-1041,1128-1140` |

## Honest corrections to the raw audit

- `SPACING_PRESETS`, `LAYOUT_PRESETS`, and `STYLE_PRESETS` are all **in use**
  (`editorUI.ts:439,451,636,933`) — not dead code.
- `--color-green` / `--color-red` (with hex fallbacks) are **correct** Obsidian theme variables, not
  "hardcoded colors." The fallback is best practice.
- The stylesheet is already accessible (focus outlines, `prefers-reduced-motion`) and themable.

## Out of scope (would be new functionality)

Real zoom / pan / fit-to-view, snap-to-grid / alignment guides, AI generation, a template gallery, and
drag inertia. (A user-selectable Native/Floating toolbar is the one sanctioned addition — see the
plan.)
