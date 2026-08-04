# Code Explanation

Short module notes for Mermaid Flow. Product status: [`../prd.md`](../prd.md).

## 1. Parsing & Serializing (`parser.ts` & `serializer.ts`)

Custom regex-based flowchart parse/serialize (no Mermaid runtime for editing).

- Positions: `%% mermaid-flow:pos …`
- Unknown lines → `extras`

Sequence / mindmap / ER live under `src/altDiagrams/`.

## 2. The Visual Engine (`canvas.ts` & `shapes.ts`)

Custom SVG canvas. Node centres are `x`/`y`. Drag is free; alignment guides are visual only. Zoom, pan, rubber-band, connect anchors.

## 3. Editor Integration (`editorBridge.ts` & `editorExtension.ts`)

Block relocate on save; CM6 Live Preview overlays; reading-mode post-processor. Fence regex lives in `diagramType.ts`.

## 4. Settings (`settings.ts`)

`PluginSettingTab` → `data.json` (open mode, toolbar, snap, AI, component library).
