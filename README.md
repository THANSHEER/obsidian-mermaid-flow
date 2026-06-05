# Mermaid Flow

[![Obsidian](https://img.shields.io/badge/Obsidian-v1.7.2+-purple.svg)](https://obsidian.md/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A visual, drag-and-drop editor for **Mermaid flowcharts** inside Obsidian. Build and rearrange diagrams by moving nodes and drawing connections — Mermaid Flow writes the underlying ` ```mermaid ` code for you, so no syntax knowledge is required.

Your edits round-trip safely: the plugin reads your existing Mermaid blocks, lets you edit them visually, and writes them back without losing custom syntax.

## Features

- **Drag-and-drop canvas** — move nodes, draw connections, resize, and select on an SVG editing surface.
- **No syntax required** — the plugin generates and updates the Mermaid code as you work.
- **Shapes & subgraphs** — multiple node shapes and grouping of nodes into subgraphs.
- **Themes & direction** — switch diagram theme and flow direction (Top-Bottom, Left-Right, and more).
- **Auto-layout & lock** — apply layout presets or let nodes arrange automatically, then lock the layout.
- **Raw code view** — open the live Mermaid source side-by-side and edit it directly; changes sync both ways.
- **Undo / redo, zoom & export** — full history, canvas zoom, and diagram export from the toolbar.
- **Persistent layouts** — manual node positions are stored in hidden Mermaid comments, so your arrangement survives reloads (and the diagram still renders normally).
- **Works everywhere** — edit from Reading mode, Live Preview, or Source mode.

## Getting Started

### Install

1. Open **Settings → Community plugins** and browse for **Mermaid Flow**.
2. Click **Install**, then **Enable**.

### Usage

**Create a diagram**
- Click the ribbon icon (workflow), or run the command **Mermaid Flow: Insert visual Mermaid diagram**.

**Edit an existing diagram**
- Click the **Edit** button on any rendered Mermaid block (Reading mode / Live Preview), or
- Place your cursor inside a `mermaid` code block and run **Mermaid Flow: Edit Mermaid diagram visually**.

**Save your changes**
- Use the **Save** button to write the diagram back to your note, or **Discard** to close without saving.
- In the embedded pane, enable **Auto-save** to persist changes automatically as you edit.

## Settings

- **Open editor as** — a centered popup or an embedded side-pane.
- **Toolbar style** — docked (native) or floating over the canvas.
- **Default direction** — flow direction applied to new diagrams.
- **Default node shape** — shape applied to newly added nodes.
- **Auto-save (embedded pane)** — automatically save edits in the embedded pane.
- **Remember node positions** — store manual layouts in hidden Mermaid comments (recommended).

## Contributing

Contributions are welcome. See the [Contribution Guide](docs/CONTRIBUTING.md) and [Architecture Overview](docs/ARCHITECTURE.md) to get started.

## License

Released under the [MIT License](LICENSE).

---

Made by [Mohammed Thansheer](https://github.com/THANSHEER)
