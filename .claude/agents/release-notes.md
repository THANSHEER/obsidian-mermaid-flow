# Release Notes Agent Guide

Use this when creating or updating release notes for Mermaid Flow.

## Source of Truth

- **Format**: [`../../release.md`](../../release.md) — complete formatting rules, examples, and style guide
- **Current changelog**: [`../../CHANGELOG.md`](../../CHANGELOG.md) — view existing releases for tone and structure
- **Changes to document**: Check `git log` or recent PR/branch for what's new/fixed/improved

## Quick Checklist

Before finalizing release notes:

- [ ] Version header: `## [X.Y.Z] - YYYY-MM-DD`
- [ ] Release title: `### [emoji] vX.Y.Z - Value Proposition, Key Benefit` (10-12 words)
- [ ] Summary: 1-2 user-focused sentences (not technical jargon)
- [ ] Only include sections with content (remove empty headings)
- [ ] Each bullet is single-sentence and user-facing
- [ ] No jargon: "Web forms" not "Worker API", "Feedback commands" not "modalless architecture"
- [ ] Footer: `---` + upgrade instructions + breaking changes note
- [ ] Tone: conversational, benefit-focused (outcomes not implementation)

## Sections Reference

```markdown
✨ New        → Brand-new commands or major capabilities
🚀 Features   → User-facing feature additions
💡 Improvements → Enhancements, performance, design, reliability improvements
🐛 Bug Fixes  → Resolved bugs
⚠️ Known Issues → Optional; only if real limitations to highlight
```

## Style Examples

**Good** (user-focused):
- "Feedback commands available via command palette — no more in-plugin forms"
- "Settings UI cleaner — removed unnecessary modal dialogs"
- "Ko-fi support now visible at first glance with badge row"

**Avoid** (technical):
- "Deprecated FeedbackModal, FeatureRequestModal, UninstallModal classes"
- "Removed UpdateModal lifecycle trigger on manifest version change"
- "Web-based feedback better aligns with Obsidian plugin guidelines"

## Translation Examples

| What Changed | How to Write It |
|---|---|
| Removed old modal UI | "Settings UI cleaner — removed in-plugin forms" |
| Added command palette commands | "Feedback commands available via command palette" |
| Changed to web forms | "Direct web forms reduce plugin complexity" |
| Removed update notifications | "Plugin no longer pops up on version changes" |
| Fixed badge styling | "README badges now uniform and consistent" |

## Process

1. **Identify changes** from git log or PR description
2. **Categorize** each change (New/Feature/Improvement/Bug Fix)
3. **Translate to user language** — focus on benefit, not implementation
4. **Write 1-2 sentence summary** explaining the theme of this release
5. **Add title** with emoji and value proposition
6. **Validate** against checklist above
7. **Add to CHANGELOG.md** at the top (newest first)

## Example Release Entry

```markdown
## [1.5.0] - 2026-08-16

### 🎯 v1.5.0 - Cleaner Feedback, Direct Web Forms

Simplified feedback flow by removing in-plugin modals and directing users to web forms instead.

### ✨ New

- Feedback commands via command palette: "Send feedback", "Request a feature", "Send uninstall feedback"

### 💡 Improvements

- Settings UI cleaner — removed modal-based feedback forms
- Removed update modal notifications on version changes
- README badges now uniform, Ko-fi support visible at first glance

### 🐛 Bug Fixes

- Removed stale feedback modal imports

---

**Upgrade:** Install from Obsidian Community Plugins.

No breaking changes.
```

## When to Call This

Use this guide when:
- Creating a new release entry before version bump
- Rewriting release notes for clarity
- Ensuring consistency across changelog entries
- Translating technical changes to user-facing language
