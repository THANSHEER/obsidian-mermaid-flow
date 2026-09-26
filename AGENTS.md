# AGENTS.md

Instructions and rules for all AI agents and tools working on this codebase.

## Core Rules

1. **Strict Task Boundaries**:
   - Perform ONLY the specific task assigned by the user.
   - Do NOT perform extra, unrequested tasks.
   - When asked to make code or document edits, ONLY modify the specified files.
   - Do NOT run git commits, branch switches, merges, or pushes unless the user explicitly asks for them.

2. **Zero Assumptions**:
   - Do exactly what is requested without making assumptions.
   - Do NOT guess user preferences or make unilateral decisions outside the prompt scope.

3. **Ask Before Acting on Doubt**:
   - If a request is unclear, ambiguous, or underspecified, stop and ask the user clarifying questions before executing any actions.

## Repository Essentials

- Visual Mermaid flowchart editor for Obsidian.
- Mobile compatible: strictly no Node.js filesystem (`fs`) or shell (`child_process`) in plugin source code (`src/`).
- External HTTP APIs used for AI assistance (`requestUrl`), avoiding Node-specific shims.
- Releases automatically extract title and curated release notes from `CHANGELOG.md` via `scripts/extract-release-notes.cjs`.
