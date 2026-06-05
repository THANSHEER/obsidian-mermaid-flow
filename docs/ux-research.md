# Mermaid Flow — UX Research

> Adaptable patterns from comparable tools — **adapt, don't copy.** Companion docs:
> [ui-audit.md](./ui-audit.md), [ui-ux-plan.md](./ui-ux-plan.md).

## Excalidraw — frictionless start, low-chrome floating toolbar, keyboard-first

- **First-open:** lands directly on an infinite canvas, instantly usable, no modal/setup. A compact
  **top-center floating tool cluster** (shapes/tools) is the only persistent chrome.
- **Layout / DnD:** the canvas is full-bleed; the left style panel appears **only when something is
  selected** (contextual, not persistent). Number/letter keys pick tools; everything is keyboard-first.
- **Adopt:** (1) an inviting, zero-setup empty canvas with one obvious first action; (2) **contextual**
  properties that appear on selection instead of a permanently-docked panel; (3) surface single-key
  tool shortcuts in tooltips.

## tldraw — modern infinite-canvas feel, smooth defaults, minimal toolbar

- **First-open:** buttery pan/zoom, a single minimal **bottom-center** toolbar; sensible default shape
  sizes/colors so users rarely need to open a panel.
- **Adopt:** (1) **strong defaults** that minimize panel trips; (2) smooth hover/selection affordances;
  (3) keep the persistent toolbar genuinely minimal and push the rest into context.

## draw.io / diagrams.net — shape library + format panel layout

- **Layout:** a left **searchable, categorized** shape library; a right **tabbed Format panel**
  (Style / Text / Arrange) that re-populates per selection.
- **Adopt:** (1) **section/tab** our long property panel (Content / Shape & size / Style); (2) better
  organize and label the shape palette; (3) group position/size into an "Arrange"-style block.

## Obsidian Canvas (core) + top plugins (Excalidraw, Kanban, Advanced Tables)

- **Native feel:** minimal chrome; selecting a card pops a **small contextual card toolbar**;
  right-click uses the native `Menu`; settings use `PluginSettingTab` with `.setHeading()`; actions are
  reachable from the command palette. Top plugins lean on native components (`Menu`, `Setting`,
  `Notice`, theme variables) and keep custom chrome small.
- **Adopt:** (1) a **contextual mini-toolbar on selection** (Canvas does this well); (2) strict native
  conventions — `.setHeading()` instead of a raw `<h3>`, Obsidian icons instead of emoji; (3)
  command/hotkey-first discoverability and honest, minimal help.

## FigJam / Figma — contextual toolbars and properties-panel patterns

- **Patterns:** a selection-anchored floating **HUD** of quick actions; a right panel of
  **collapsible, sectioned** properties; FigJam's bottom create-bar; strong **template/stamp empty
  states**.
- **Adopt:** (1) quick actions **where the selection is**; (2) **collapsible sections** in the panel;
  (3) a guided, friendly empty state.

## Cross-cutting ideas we will adopt

1. **Frictionless first-open** with an explicit on-canvas empty-state call-to-action.
2. **Lower-chrome, clearly-grouped toolbar**; prefer contextual surfaces over always-on chrome.
3. **Sectioned (and optionally collapsible) properties panel.**
4. **Stronger defaults + clearer affordances** (connect cursor, discoverable anchors).
5. **Native Obsidian conventions + honest copy** (no emoji-as-icon, no documenting features that don't
   exist, `.setHeading()`).
