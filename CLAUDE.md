# CLAUDE.md

Guidance for AI agents working in this repository.

## What this is

Mermaid Flow — Obsidian community plugin: visual editor for Mermaid diagrams.
TypeScript in `src/` → esbuild → `main.js`. The repo lives inside a vault at
`.obsidian/plugins/obsidian-mermaid-flow/`; `dev`/`build` write into the live
plugin folder. Reload the plugin (or hot-reload) to test.

Product status / roadmap: [`PRD.md`](PRD.md), [`README.md`](README.md).

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
- **AI assist** (optional) — `src/ai/`: HTTP providers (OpenAI/Gemini/Anthropic,
  `httpProviders.ts`) or desktop CLI (`cliProvider.ts`, gated behind
  `Platform.isDesktopApp`) generate/improve a diagram from a prompt; UI in
  `aiModal.ts`.
- **Feedback lifecycle** — `src/feedback/`: install/uninstall/version-change
  prompts route to web forms via command palette, no in-plugin modals.

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

`CHANGELOG.md` is the source of truth for what actually changed, grounded in
the real diff per version (not commit-message paraphrase) — Keep a Changelog
style: `## [X.Y.Z] - YYYY-MM-DD` with `### Features` / `### Improvements` /
`### Fixes` subsections, newest first, `[Unreleased]` at the top for work not
yet tagged. No `release.md` — GUIDE.md documents the format if it needs
re-deriving.

**Before a release:**

1. Add/update the `CHANGELOG.md` entry for the version from the actual diff,
   not just the PR title — verify feature attribution against `git diff
   <prev-tag>..<tag>`, since commit messages here have historically been
   wrong about which version something shipped in.
2. Run `npm version <v>` + push; wait for a green CI run on `main`.
3. CI auto-creates the GitHub release (`main.js`, `manifest.json`,
   `styles.css`) with a bare version title and `--generate-notes` placeholder
   body — never leave that placeholder as the final release. Replace it with
   `gh release edit <version> --title "vX.Y.Z - Title" --notes-file <path>`:
   title picked from the CHANGELOG entry (not auto-generated), notes are the
   matching CHANGELOG.md section **verbatim** — same `### Features` /
   `### Improvements` / `### Security` / `### Fixes` headings and wording, not
   a reworded "What's new / What's better" paraphrase.
4. Run `npm run validate` to check manifest version sync.
5. Run `/code-review` before pushing.

## Local AI tooling (`.claude/`)

- **Guard hook** — after edits, greps for the four listing rules + version sync.
- **`plugin-auditor` agent** — deep audit before push/PR/release.
- **`release-notes` agent** — drafts the GitHub release notes in plain,
  user-facing language and applies them via `gh release edit`.
- **`mermaid-roundtrip` skill** — when touching parse↔serialize core.
