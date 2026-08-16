# CLAUDE.md

Guidance for AI agents working in this repository.

## What this is

Mermaid Flow — Obsidian community plugin: visual editor for Mermaid diagrams.
TypeScript in `src/` → esbuild → `main.js`. The repo lives inside a vault at
`.obsidian/plugins/obsidian-mermaid-flow/`; `dev`/`build` write into the live
plugin folder. Reload the plugin (or hot-reload) to test.

Product status / roadmap: [`prd.md`](prd.md), [`README.md`](README.md).

## Commands

```bash
npm run dev       # esbuild watch (no typecheck)
npm run build     # tsc -noEmit + production bundle
npm run lint      # eslint src/**/*.ts
npm run validate  # manifest version sync + required fields
npm test          # vitest
npm version <v>   # bumps manifest + versions.json
```

CI on `main`: `validate` → `lint` → `test` → `build`. Tag push → release assets.

`tsconfig` is `strict` (incl. `noUncheckedIndexedAccess`). Guard array/Map access.

## Architecture (essentials)

```mermaid
Mermaid text ──parser.ts──▶ DiagramModel ──serializer.ts──▶ Mermaid text
                            (editor mutates in place)
```

- **Flowcharts** — `DiagramModel` in `model.ts`; nested subgraphs via `parentId`.
  Unknown lines → `model.extras` (never drop). Positions: `%% mermaid-flow:pos …`.
- **Alt diagrams** — sequence / mindmap / ER in `src/altDiagrams/` (own parse/
  serialize + `AltDiagramModal`). Routed by `diagramType.ts`.
- **Entry points** — `main.ts` (commands/ribbon), reading-mode post-processor,
  Live Preview CM6 extension (`editorExtension.ts`). Shared fence regex:
  `OPEN_FENCE_RE` / `closingFenceRe` in `diagramType.ts` only.
- **Editor hosts** — `DiagramEditorUI` in modal (`editorModal.ts`) or pane
  (`editorView.ts`). Canvas: `canvas.ts` (node.x/y = centre). Free drag —
  alignment guides are visual only (no forced snap).

## Obsidian listing rules (must not break)

1. Prefer `activeDocument` / `activeWindow` over bare `document` / `window`.
2. No `.style.*` on SVG — use `setAttribute`. HTML: CSS classes + `classList`.
3. No floating promises / bare `void` on promises — use `.catch()`.
4. No `!important` in CSS — raise specificity (e.g. `.modal.mermaid-flow-modal`).

**Mobile:** `isDesktopOnly: false`. No Node/Electron imports from `src/`.
CLI AI may use `window.require` only after `Platform.isDesktopApp`.

**SVG colours:** never put unresolved `var(--…)` into SVG `fill`/`stroke`
attributes — fall back to concrete hex (`VAR_FALLBACK` in `canvas.ts`). Tests
must assert no `"var("` in rendered SVG attrs (`canvas.test.ts`).

**Versions:** `manifest.json` === `package.json`; use `npm version`.

## Testing

```bash
npm test
npm test -- canvas    # file name pattern
```

Polyfills live only in `tests/setup.ts`. UI/render changes → update
`canvas.test.ts`. Parser/serializer changes → round-trip tests + follow
`.claude/skills/mermaid-roundtrip/SKILL.md`.

## Release & Changelog

**Before creating a release:**

1. Collect changes into `CHANGELOG.md` following [`release.md`](./release.md) format
2. Use semantic versioning: Major.Minor.Patch
3. Structure each release with:
   - **Title**: `### [emoji] vX.Y.Z - Value Proposition, Key Benefit`
   - **Summary**: 1-2 user-focused sentences
   - **Sections**: ✨ New, 🚀 Features, 💡 Improvements, 🐛 Bug Fixes (only if applicable)
4. Run `npm run validate` to check manifest version sync
5. Run `/code-review` before pushing

**Release cadence:**
- Tag push to `main` triggers CI → auto-release with assets (main.js, manifest.json)
- GitHub Releases mirror CHANGELOG.md content

**Reference:** See [`release.md`](./release.md) for complete formatting guide and examples.

## Local AI tooling (`.claude/`)

- **Guard hook** — after edits, greps for the four listing rules + version sync.
- **`plugin-auditor` agent** — deep audit before push/PR/release.
- **`mermaid-roundtrip` skill** — when touching parse↔serialize core.
