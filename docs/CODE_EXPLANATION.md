# Code Explanation

This document provides a deeper dive into specific modules within Mermaid Flow.

## 1. Parsing & Serializing (`parser.ts` & `serializer.ts`)
The parser is a custom implementation designed to extract nodes and relationships without using the heavy Mermaid library itself for parsing. This keeps the plugin lightweight.
- **Regex-based:** It uses regular expressions to identify node IDs, labels, shapes, and connection types (e.g., `-->`, `---`, `-.-`).
- **Metadata:** It specifically looks for the `%%{...}%%` block for position data.

## 2. The Visual Engine (`canvas.ts` & `shapes.ts`)
The editor uses a custom-built canvas interaction layer rather than a heavy library like React Flow to ensure it feels native to Obsidian.
- **Shapes:** Different Mermaid shapes (rounded, diamond, etc.) are mapped to SVG or CSS representations.
- **Coordinate System:** Handles zooming and panning within the editor view.

## 3. Editor Integration (`editorBridge.ts` & `editorExtension.ts`)
This is the most complex part of the plugin.
- **Locating Blocks:** Since users can edit a note while the Mermaid editor is open, we use "relocation" logic to find the original Mermaid block even if it shifted up or down.
- **CM6 Extensions:** Provides the "Edit" button in Live Preview mode using the CodeMirror 6 StateField and Decoration APIs.

## 4. Settings (`settings.ts`)
Uses standard Obsidian `PluginSettingTab`. We persist settings in `data.json`.
