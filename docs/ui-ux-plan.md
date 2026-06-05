# Mermaid Flow — UI/UX Improvement Plan

> Synthesis of [ui-audit.md](./ui-audit.md) + [ux-research.md](./ux-research.md). A prioritized,
> sequenced list of concrete, single-area changes.

## Context

This is a **UX-only** improvement of the current release (v1.1.0): layout, visual design, interaction
feel, onboarding/empty states, and the first-open experience. Existing functionality must behave
identically — the parser/serializer round-trip, the model, and every existing action.

**One user-sanctioned exception:** a new `toolbarStyle` setting that switches the nav bar between
*native/docked* and *floating*, defaulting to **native** so current behavior is preserved.

## Decisions

- **Toolbar (resolved):** the nav bar becomes a **user setting** — *Native (docked)* vs *Floating
  (low-chrome over the canvas)* — and we build **both**; the plugin user chooses. Default = **Native**.
- **First-open & dead AI setting (flagged):** plan reuses `starterModel()` for first-open and removes
  the dead `promptTemplate` setting. Either can be kept untouched on request.

## Sequenced changes (one area each; build + regression check + separate commit per item)

### P0 — Split docs *(docs only)*
Create `docs/ui-audit.md`, `docs/ux-research.md`, `docs/ui-ux-plan.md`.

### 1 — First-open & empty state — *High (canvas.ts + styles.css; optional main.ts)*
- Render an on-canvas empty state when `nodes.length===0`: centered, muted, `pointer-events:none`
  hint ("Click ◆ Add shape to place your first node" + 2 key tips). Additive.
- *(behavior-safe)* swap `emptyModel`→`starterModel` at `main.ts:145` so a "Start" node greets new
  users — reuses the existing function.
- Tighten the no-selection panel hint hierarchy (`editorUI.ts:793-810`).
- **Before:** blank grid + side hint. **After:** a canvas that tells you what to do.

### 2 — Honest + complete help/onboarding copy — *High (editorUI.ts; copy-only)*
- Rewrite `editorUI.ts:1486-1494` to match reality (scroll/scrollbars to move around; remove false
  "drag to pan" / "scroll to zoom"); fix "📝 button" → "code button"; add Shift-click multi-select,
  rubber-band, and drag-from-anchor tips.
- **Before:** misleading. **After:** accurate + fuller.

### 3 — Settings declutter — *High (settings.ts + styles.css)*
- Remove the dead `promptTemplate` setting, its `<h3>` "AI & Templates", and `.mermaid-flow-prompt-*`
  CSS. Use `.setHeading()` for any remaining grouping; order as Editor / Diagram defaults / Behavior.
- **Before:** promises non-existent AI. **After:** honest, native, tidy.

### 4 — Toolbar style: Native vs Floating — *High (settings.ts + editorUI.ts + styles.css)*
- Add `toolbarStyle: "native" | "floating"` to `MermaidFlowSettings` + `DEFAULT_SETTINGS`
  (default `"native"`) and a settings dropdown; pass it into `DiagramEditorUI`.
- **Native (default):** today's docked top bar, tidied — group dividers, refined spacing, secondary
  controls (theme/direction/export/help) folded into an overflow "⋯" `Menu`; fix mid-width wrapping.
- **Floating:** the *same* buttons in a compact low-chrome bar floating over the canvas region.
- Both render from one `buildToolbar()` by toggling a root class (`.is-toolbar-floating` /
  `.is-toolbar-native`) — no duplicated logic, identical handlers/tooltips/shortcuts. The properties
  panel stays docked on the right in both modes (contextual/popover properties = optional future work).
- **Before:** one fixed flat bar that wraps awkwardly. **After:** user picks docked-tidy or
  floating-modern; one shared code path.

### 5 — Properties panel: section + clarity — *Med (editorUI.ts + styles.css)*
- Group the node panel into Content / Shape & size / Style using `.mermaid-flow-subhead`; widen/label
  W×H; optional panel collapse toggle to reclaim canvas width.
- **Before:** long scroll. **After:** sectioned.

### 6 — Connect/selection affordances + overlay — *Med (canvas.ts + styles.css)*
- Add a Connect-mode cursor (crosshair via a class toggled in `setMode`); make anchors a touch more
  discoverable; raise Edit/Code overlay default opacity (0.6 → ~0.8); friendlier pane empty-state copy.
  No new interactions.
- **Before:** connect feels invisible. **After:** clearer affordances.

### 7 — Native consistency polish — *Low (editorUI.ts + styles.css)*
- Replace emoji-as-icon with `setIcon` (Help headings, code-view error → "alert-triangle"); make color
  swatch defaults theme-aware; align overlay-button styling with toolbar buttons.

## Verification (every item)

- `npm run build` (tsc typecheck + esbuild) and `npm run lint` must pass.
- Reload in Obsidian; test **both** toolbar styles (native + floating) and **both** hosts (modal +
  pane): insert new (empty-state), add shapes, drag, Shift-multi-select, rubber-band, both connect
  methods, edit → save.
- **Invariant check:** open an existing diagram and save with no edits — serialized Mermaid must be
  byte-identical (lossless round-trip). Reading-mode + Live-Preview overlays still appear and work.
- Each item committed separately; pause for review before the next.
