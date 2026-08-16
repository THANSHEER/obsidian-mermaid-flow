# Changelog

All notable changes to Mermaid Flow are documented here. See [Release Notes Guide](./release.md) for formatting rules.

## [1.6.0] - 2026-08-16

### 🧹 v1.6.0 - Code Cleanup, Streamlined Feedback Module

Removed unnecessary legacy code from the feedback module to reduce bundle size and maintenance burden. Kept only essential version tracking while maintaining the new web-based feedback command flow.

### 💡 Improvements

- **Removed legacy API code** — deleted unused feedback submission functions that relied on old modal infrastructure
- **Cleaned up feedback module** — removed 400+ lines of modal components and old API bindings (api.ts, modals.ts, releaseNotes.ts)
- **Streamlined exports** — feedback module now exports only what's actively used (version lifecycle tracking)
- **Smaller bundle** — reduced plugin size by removing deprecated code paths
- **Maintainability** — clearer module purpose with only essential version tracking

### 🐛 Bug Fixes

- Removed dead imports and stale code references that could confuse future maintenance

---

**Upgrade:** Install from Obsidian Community Plugins or run `npm install` if building from source.

No breaking changes.

---

## [1.5.0] - 2026-08-16

### 🎯 v1.5.0 - Cleaner Feedback, Direct Web Forms

Simplified feedback flow by removing in-plugin modals and directing users to web forms instead. Added convenient commands for feedback while keeping the visual editor focused.

### ✨ New

- **Feedback commands** via command palette: "Send feedback", "Request a feature", "Send uninstall feedback"
- Users can now share feedback, feature requests, and uninstall reasons directly through web forms (no Turnstile complexity in plugin)

### 💡 Improvements

- **Settings UI cleaner** — removed modal-based feedback forms from settings tab
- **Removed update modal** — plugin no longer pops up notifications on version changes (update info is in the community plugins list)
- **README badges** now uniform and consistent, with Ko-fi support visible at first glance
- **Web-based feedback** better aligns with Obsidian plugin guidelines (no plugin ↔ backend API calls)

### 🐛 Bug Fixes

- Removed stale feedback modal imports that were unused in some code paths

---

**Upgrade:** Install from Obsidian Community Plugins or run `npm install` if building from source.

No breaking changes.

---

## [1.4.5] - 2026-08-04

### ✨ v1.4.5 - Expanded Editing, Cleaned Up Behavior

Expanded Mermaid diagram editing capabilities with improved performance and removed stale behaviors that were no longer needed.

### 🚀 Features

- Extended diagram editing capabilities for better diagram manipulation

### 💡 Improvements

- Cleaned up stale and unnecessary code paths
- Improved performance for diagram editing operations

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.4.4] - 2026-06-27

### 🔧 v1.4.4 - CI Automation, Release Assets

Auto-release workflow and asset attachment on version bump for streamlined deployment.

### 💡 Improvements

- Automated release process on version bump
- Release artifacts (main.js, manifest.json) now attached to GitHub releases
- Faster iteration and deployment cycle

---

**Upgrade:** No user-facing changes.

No breaking changes.

---

## [1.4.3] - 2026-06-27

### 🚀 v1.4.3 - New Features & Enhancements

Added new features to enhance diagram editing and plugin functionality.

### ✨ New

- Enhanced diagram creation and editing workflows
- New capabilities for better diagram management

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.4.2] - 2026-06-21

### 🔧 v1.4.2 - Editor Blackout Fix

Fixed critical editor rendering issue where the canvas would sometimes appear blank.

### 🐛 Bug Fixes

- Fixed editor blackout issue where canvas rendering would fail
- Restored visual feedback during diagram editing

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.4.1] - 2026-06-20

### 🎨 v1.4.1 - Canvas Rendering, Code Cleanup

Fixed black-box canvas rendering issue and cleaned up duplicate code for better maintainability.

### 🐛 Bug Fixes

- Fixed black-box (blank) canvas rendering on certain systems
- Resolved duplicate rendering logic that could cause visual glitches

### 💡 Improvements

- Removed dead code paths for cleaner codebase
- Simplified canvas rendering logic

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.4.0] - 2026-06-13

### 🚀 v1.4.0 - Feature & Performance Improvements

Added new features and performance improvements to enhance the overall diagram editing experience.

### 🚀 Features

- New diagram editing capabilities
- Enhanced user interface elements

### 💡 Improvements

- Better performance for large diagrams
- Improved responsiveness during editing

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.3.1] - 2026-06-06

### 🔄 v1.3.1 - Stability & Polish

Minor stability improvements and polish release.

### 💡 Improvements

- Overall stability enhancements
- Code cleanup and organization

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.3.0] - 2026-06-05

### ✨ v1.3.0 - New Functionality & Features

Added significant new functionality to expand diagram editing capabilities.

### ✨ New

- New diagram creation and editing features
- Enhanced component support

### 🚀 Features

- Additional node types and diagram elements
- Expanded editing toolbar options

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.2.0] - 2026-06-03

### 🎨 v1.2.0 - CSS Improvements, Bug Fixes

Removed unnecessary CSS specificity rules and fixed styling issues.

### 🐛 Bug Fixes

- Removed `!important` flags from CSS — raised specificity instead for better maintainability
- Fixed CSS conflicts that could cause unexpected styling

### 💡 Improvements

- Cleaner CSS structure following Obsidian plugin guidelines
- Better style inheritance and predictability

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.1.2] - 2026-06-03

### 🎨 v1.1.2 - CSS Polish

CSS styling improvements and fixes.

### 💡 Improvements

- Enhanced visual styling consistency
- Better dark/light mode support

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.1.0] - 2026-05-27

### 🚀 v1.1.0 - Refinements & Polish

Refined core features and improved overall user experience.

### 🚀 Features

- Improved diagram editing interface
- Enhanced visual feedback during interaction

### 💡 Improvements

- Better performance across different systems
- Refined user workflows

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.

---

## [1.0.0] - 2026-05-27

### 🎉 v1.0.0 - Visual Mermaid Editor for Obsidian

Initial release of Mermaid Flow — a visual, drag-and-drop editor for Mermaid diagrams inside Obsidian. Build and rearrange diagrams by moving nodes and drawing connections without needing to know Mermaid syntax.

### ✨ New

- Visual drag-and-drop flowchart editor
- Support for multiple diagram types (flowchart, sequence, mindmap, ER)
- Node positioning and connection management
- Subgraph support for grouping related nodes
- Diagram themes and direction control

### 🚀 Features

- Live preview while editing
- Undo/redo support with full history
- Zoom and pan on canvas
- Multiple node shapes and styling options
- Export diagrams as PNG/SVG
- Code view for direct Mermaid syntax editing
- Persistent node positions with hidden comments

### 💡 Improvements

- No syntax knowledge required — plugin generates Mermaid code automatically
- Round-trip safe — existing advanced syntax is preserved
- Works in Reading mode, Live Preview, and Source mode
- Performance optimized for large diagrams

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.
