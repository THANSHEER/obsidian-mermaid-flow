---
name: mermaid-roundtrip
description: Safely change the Mermaid Flow parse↔serialize round-trip core. Use when editing parser.ts, serializer.ts, model.ts, layout.ts, or adding a node shape / edge kind / direction / Mermaid syntax — anywhere a change could drop or corrupt a user's diagram. Encodes the non-negotiable invariants and the test loop so AI-generated changes to this fragile area stay safe.
---

# Mermaid Flow — safe round-trip changes

The plugin is a visual wrapper around Mermaid text. Everything flows through one
shape and back:

```
Mermaid text ──parser.ts──▶ DiagramModel ──serializer.ts──▶ Mermaid text
                            (the editor mutates this in place)
```

A careless change here silently eats part of a user's diagram. Follow these rules.

## Invariants you must not break

1. **The parser never drops a line.** `parser.ts` understands only the common
   flowchart subset. Any line it cannot interpret — `classDef`, `click` bindings,
   comments, unknown directives, styling it doesn't model — MUST be pushed verbatim
   into `model.extras` and re-emitted by `serializer.ts`. When extending the parser,
   either add real handling **or** let the line fall through to `extras`. Never add
   a branch that consumes-and-discards.

2. **Round-trip is identity for understood input.** `serialize(parse(text))` must
   reproduce the meaningful content of `text` (modulo formatting). Adding a model
   field means teaching BOTH `parser.ts` (read it) and `serializer.ts` (write it).

3. **Position comment stays valid Mermaid.** Manual positions persist as
   `%% mermaid-flow:pos A=x,y[,w,h] …`. Mermaid ignores `%%`, so it must remain a
   comment. The parser reads it back; gated by `savePositions` / `includePositions`.

4. **Enum tables move together.** `model.ts` holds `NodeShape` / `EdgeKind` /
   `Direction` with parallel `*_LABELS` maps. Add an enum value ⇒ update its label
   map, the parser recognizer, the serializer emitter, and `shapes.ts` geometry.

5. **`OPEN_FENCE_RE` is duplicated** in `main.ts`, `editorBridge.ts`,
   `editorExtension.ts`. Change one ⇒ change all three.

6. **Mobile/popout safe.** No Node/Electron APIs at runtime; use `activeDocument` /
   `activeWindow`, not `document` / `window`. (See CLAUDE.md audit rules.)

## Workflow for a change here

1. **Locate the seam.** Read the relevant part of `parser.ts` (line-based,
   regex-driven, forgiving) and `serializer.ts`. Find where similar syntax is
   already handled — mirror that pattern rather than inventing one.
2. **Decide: handle or preserve.** New syntax you support → add a parser branch +
   serializer emitter + (if structural) a `model.ts` field. New syntax you don't
   support → confirm it lands in `model.extras` untouched.
3. **Write a round-trip test FIRST** in `tests/parser.test.ts` /
   `tests/serializer.test.ts`: feed representative Mermaid (including an `extras`
   line — a `classDef` or comment), parse → serialize, assert nothing was lost and
   understood content is correct. Add an `extras`-preservation assertion for any
   parser change.
4. **Implement** the smallest change that passes, matching surrounding style.
5. **Verify** (the project has no separate lint-for-tests; run the full set):
   ```bash
   npm test            # round-trip + rendering; add -- parser / -- serializer to focus
   npm run lint        # no floating promises, no bare document
   npm run build       # tsc strict (noUncheckedIndexedAccess) + bundle
   npm run validate    # manifest/version sync
   ```
   `tsconfig` is strict with `noUncheckedIndexedAccess` — guard every array/Map
   access you add.
6. **If rendering changed** (new shape/edge/label path), add the matching assertion
   in `tests/canvas.test.ts` and polyfill any new Obsidian global in `tests/setup.ts`
   (the single place for polyfills) — both are required by CLAUDE.md.

## Quick reference — where things live
- `parser.ts` — text → model; forgiving; unknown → `extras`.
- `serializer.ts` — model → text; emits the `%% mermaid-flow:pos` comment.
- `model.ts` — `DiagramModel`, enum tables + `*_LABELS`, mutators, id generators.
- `layout.ts` — rank-based auto layout when positions are missing.
- `shapes.ts` / `nodeGeometry.ts` — per-shape SVG geometry and size estimation.
