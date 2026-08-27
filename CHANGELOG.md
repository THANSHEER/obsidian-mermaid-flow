# Changelog

All notable changes to Mermaid Flow are documented here.

## [1.8.1] - 2026-08-27

### Fixes
- Preserved quoted labels containing semicolons: statements are no longer split on `;` inside quoted node labels, edge labels, or HTML entities like `&nbsp;` and `&quot;`, preventing label truncation and diagram corruption (#26)
- Subgraph preservation: subgraphs containing nodes with semicolons or HTML entities are no longer deleted on save (#26)
- Double-quote round-trip stability: labels containing double quotes now round-trip cleanly without minting ghost nodes (`hi["hi"]`, `quot["quot"]`) on repeated save/open cycles (#26)
- Ghost-free subgraph styling: `style <subgraphId>` now styles the subgraph group directly without creating a stray node rectangle or extra position coordinates (#27)
- Subgraph layout direction scoping: `direction` statements inside subgraphs now remain inside the subgraph block instead of moving to the root diagram (#27)
- Subgraph classDef assignment: `class <subgraphId> name` now applies the classDef to the group container without minting a ghost node
- Subgraph comment and extras scoping: comments (`%%`) and unsupported syntax inside subgraphs retain their enclosing scope on save
- Arrow operator safety: labels containing `-->`, `---`, or `==>` (e.g. `A["Step 1 --> Step 2"]`) are no longer misinterpreted as link operators
- Inline label hyphens: inline edge labels containing hyphens (e.g. `A -- step-by-step --> B`) now parse correctly

### Security
- External link navigation hardening: restricted node link external navigation to safe protocols (`http:`, `https:`, `mailto:`) with `noopener,noreferrer` attributes, preventing navigation to untrusted URI schemes

---

## [1.8.0] - 2026-08-21

### Features
- Full-bleed canvas layout: the diagram canvas now extends edge-to-edge across editor and modal views with a continuous grid background, removing bounding borders, radius, and margins (#21)
- Hidden visual scrollbars on the canvas while preserving full mouse, trackpad gesture, spacebar pan, and scroll-wheel navigation (#21)
- Full-width floating toolbar: the floating toolbar now spans the full width of the editor with natural multi-line flex-wrapping on narrower viewports (#22)
- Overlap prevention for floating actions: reserved space ensures the pinned Save and Discard buttons never collide with toolbar tool items (#22)
- Auto-hiding floating properties panel: the properties panel automatically hides while dragging a node, group, edge, or resize handle, restoring full canvas visibility during positioning (#23)

---

## [1.7.1] - 2026-08-19

### Fixes
- Removed dynamic script injection for the Ko-fi support widget to comply with Obsidian community plugin security policies; support button is now rendered natively in settings.
- Replaced `createEl` usage with Obsidian `createSpan` helper in code view error display.

---

## [1.7.0] - 2026-08-16

### Features
- Setting to open the embedded editor pane as its own tab instead of always splitting the pane vertically (#12)
- Rich text rendering on the canvas: `<b>`/`<strong>`, `<i>`/`<em>`, and `<font color>` tags in node and edge labels now render as styled text instead of raw tags, matching how Obsidian's built-in Mermaid renderer already displays them (#14)
- Setting to disable canvas auto-resize, so panning or dragging a node near the edge no longer shrinks the whole diagram to fit (#15)
- Floating properties panel option, replacing the fixed sidebar so the canvas can use the full width when nothing is selected (#16)
- Setting to collapse properties-panel sections by default (#13)
- "View release notes" button in settings, linking straight to the GitHub Releases page

### Improvements
- Removed the in-app feedback pop-up shown on install/uninstall/update; feedback, feature requests, and uninstall surveys are now only reachable via the existing command palette entries that open the web forms directly
- Plugin no longer submits anything to a backend on version change — it just records the version silently

### Security
- Rich text label parsing (#14) never uses `innerHTML` — `<b>`/`<i>`/`<font>` tags are tokenized and only their text content is written back via `textContent`, so a crafted label can't inject arbitrary markup into the DOM

---

## [1.6.0] - 2026-08-16

### Features
- Feedback prompts on install, uninstall, and version updates, using an in-app dialog (star rating, optional message, optional email) that submits to a small backend service
- Command palette commands to open the web-based feedback, feature-request, and uninstall-survey forms directly: "Send feedback", "Request a feature", "Send uninstall feedback"
- Ko-fi support widget in settings, with a fallback button if the embedded widget script fails to load (offline, mobile, or CSP restrictions)

---

## [1.5.0] - 2026-08-04

Version/tag housekeeping only — no functional changes from 1.4.5.

---

## [1.4.5] - 2026-08-04

### Features
- Visual editors for sequence diagrams, mindmaps, and entity-relationship (ER) diagrams — the visual editor previously only supported flowcharts
- Component library: save reusable diagram snippets and insert them into any diagram
- Nested subgraphs: a subgraph can now contain other subgraphs, and the nesting survives editing and Mermaid round-trips
- Plugin is no longer marked desktop-only

### Improvements
- Collapsible sections in the properties panel and settings
- Configurable default node shape
- Documentation refresh: updated roadmap, PRD, and architecture docs; archived stale UI/UX audit notes

---

## [1.4.4] - 2026-06-27

### Improvements
- CI now automatically publishes a GitHub Release with build assets (`main.js`, `manifest.json`, `styles.css`) whenever the plugin version is bumped, replacing a manual release step

No user-facing plugin changes.

---

## [1.4.3] - 2026-06-27

### Features
- Click-to-navigate node links: clicking a node with a Mermaid `click` link in Reading mode or Live Preview jumps straight to its target note or URL, using the plugin's own click handling instead of Mermaid's native binding (which Obsidian's security settings can strip, and which can't resolve `[[wiki links]]` anyway)

---

## [1.4.2] - 2026-06-21

### Features
- Double-click a node or edge label to edit it directly on the canvas
- Drag an edge's endpoint to reconnect it to a different node
- Resize handles for subgraph groups
- Alignment guide lines while dragging nodes

### Fixes
- Fixed another canvas rendering "blackout" case, on top of the fix shipped in 1.4.1

---

## [1.4.1] - 2026-06-20

### Improvements
- Consolidated duplicate parsing logic (style-property parsing, closing-fence regex matching) into single shared helpers
- Removed ~90 lines of dead export code left over from before the dedicated export manager

### Fixes
- Fixed nodes rendering as solid black boxes with invisible text: when the canvas couldn't resolve a CSS color variable, it wrote the unresolved `var(...)` token straight into the SVG, which silently fell back to black. Color resolution now always falls back to a concrete color instead.

---

## [1.4.0] - 2026-06-13

### Features
- AI-assisted diagram generation and editing: describe a diagram in plain text and generate or improve it via OpenAI, Gemini, or Anthropic, or via a desktop CLI tool — configurable provider, model, and prompt template, with entry points in both the command palette and the editor toolbar
- Generate a diagram from an image dropped or pasted onto the canvas
- Custom theme color palette, applied to canvas rendering

### Improvements
- More accurate node sizing via a dedicated text-measurement helper
- Substantially expanded automated test coverage (AI providers, canvas, diagram types, layout, theme palette)

---

## [1.3.1] - 2026-06-06

### Improvements
- Stricter linting and build attestation enforced in CI

### Fixes
- Replaced bare `document`/`window` references with `activeDocument`/`activeWindow` throughout, fixing behavior when the editor is opened in a popout window

---

## [1.3.0] - 2026-06-05

### Features
- Insert-from-template picker with built-in starter diagrams
- Export diagrams to PNG or SVG (to the vault), plus copy-to-clipboard
- Alignment and distribution tools for selected nodes (align left/right/top/bottom/center, distribute horizontally/vertically)
- Dedicated properties panel for editing node, edge, and group details
- Toolbar rebuilt as its own module with a drag-to-canvas shape palette

### Improvements
- Editor UI code substantially reorganized into dedicated modules (toolbar, properties panel, export, alignment, templates) instead of one large file

---

## [1.2.0] - 2026-06-03

### Improvements
- Multi-line labels are collapsed to a single line on serialize, preventing a label from breaking its node's Mermaid statement
- Added a full unit test suite (parser, serializer, model, canvas, settings)

### Security
- Node, edge, and subgraph IDs are sanitized (restricted to alphanumeric/underscore) before being written to Mermaid text — defense-in-depth against a malformed ID injecting extra Mermaid syntax into the generated diagram

### Fixes
- Removed `!important` from CSS rules in favor of proper specificity, and scoped focus-visible styles to the plugin's own elements instead of overriding global `button:focus`/`input:focus`/etc. — both required for Obsidian's community plugin listing

---

## [1.1.2] - 2026-06-03

### Improvements
- Multi-line labels are collapsed to a single line on serialize, preventing a label from breaking its node's Mermaid statement
- Added a full unit test suite (parser, serializer, model, canvas, settings)

### Security
- Node, edge, and subgraph IDs are sanitized (restricted to alphanumeric/underscore) before being written to Mermaid text — defense-in-depth against a malformed ID injecting extra Mermaid syntax into the generated diagram

### Fixes
- Removed `!important` from CSS rules in favor of proper specificity, and scoped focus-visible styles to the plugin's own elements instead of overriding global `button:focus`/`input:focus`/etc. — both required for Obsidian's community plugin listing

---

## [1.1.0] - 2026-05-27

### Improvements
- Added CI, CodeQL security scanning, and an automated release workflow
- Added an AI prompt template setting in settings, ahead of the AI generation feature that shipped in 1.4.0

---

## [1.0.0] - 2026-05-27

### Features
- Initial release: visual editor for Mermaid flowcharts — add nodes, draw connections, and arrange layout by dragging, no Mermaid syntax required
- Two-way sync between the visual canvas and Mermaid text, so hand-written Mermaid and the visual editor stay consistent
- Editor available as a modal or a dedicated pane
- Works directly in Reading mode and Live Preview
