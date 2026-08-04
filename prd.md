# Mermaid Flow — Product Requirements (PRD)

Visual WYSIWYG editor for Mermaid diagrams inside Obsidian. Status reflects **v1.4.4+**.

## Vision

Let users create and edit Mermaid diagrams by dragging nodes and drawing connections — without needing Mermaid syntax — while never corrupting advanced source on save.

## Completed (shipped)

| Area | What |
|------|------|
| Flowchart visual editor | Drag, connect, resize, multi-select, subgraphs (incl. nested), undo/redo, zoom/pan |
| Round-trip safety | Parse → edit → serialize; unknown lines preserved in `extras` |
| Positions | `%% mermaid-flow:pos …` comment; optional via settings |
| Styling | Per-node/edge colors, `classDef`, themes, style presets |
| Component library | Save selection as reusable snippets; insert from toolbar |
| AI assist | Text / image / improve via OpenAI, Gemini, Anthropic, or desktop CLI |
| Entry points | Source, Reading mode, Live Preview overlays; modal or pane host |
| Alternate diagrams | Visual editors for **sequence**, **mindmap**, and **ER** |
| UX polish | Empty state, connect affordances, collapsible panel, extras notice, free drag (no forced alignment snap) |
| Platform | `isDesktopOnly: false`; CLI AI gated to desktop |

## Remaining (backlog)

| Priority | Item |
|----------|------|
| P1 | Deeper sequence UX (loops, alts, notes, activations) |
| P1 | Drag-layout + richer editing for mindmap / ER |
| P2 | More Mermaid kinds (state, class, gantt, …) beyond code-view fallback |
| P2 | Selection HUD / contextual mini-toolbar (optional chrome reduction) |

## Non-goals

- Replacing Obsidian’s Mermaid renderer
- Executing `click` / callbacks inside the plugin
- Full parity with every Mermaid diagram type in v1

## Success criteria

- Edit → save leaves understood structure correct and unknown lines intact
- Flowchart canvas usable without reading Mermaid docs
- CI: `validate` → `lint` → `test` → `build` green before release
