# Release Notes Agent Guide

Use this when drafting or updating GitHub release notes for Mermaid Flow.

## Source of truth

`CHANGELOG.md` is the technical source of truth (Keep a Changelog format,
grounded in the real diff per version). GitHub Releases are a public-friendly
translation of the matching `CHANGELOG.md` entry, not a separate source — no
`release.md` in this repo. See CLAUDE.md's "Release & Changelog" section for
the full flow.

- **Format**: plain language, no emoji, no code/implementation detail —
  what's new, what's better, what's fixed, how to update.
- **Changes to document**: the `CHANGELOG.md` entry for the version, verified
  against `git diff <prev-tag>..<tag>` — commit/PR titles in this repo have
  historically misattributed which version a feature actually shipped in, so
  don't trust them alone.
- **Apply directly** to the CI-created draft release:
  `gh release edit <version> --title "vX.Y.Z - Title" --notes "..."` — title
  picked from the CHANGELOG entry, never left as the auto-generated placeholder.

## Quick checklist

Before finalizing:

- [ ] Title: `vX.Y.Z - Value proposition` (short, benefit-focused, no emoji)
- [ ] 1-2 sentence summary in plain language
- [ ] Grouped only where there's content: What's new / What's better / What's fixed
- [ ] Each line is a single user-facing sentence — no class/file names, no internal architecture
- [ ] Ends with how to update (Community Plugins auto-update) and a breaking-change note if relevant

## Style examples

**Good** (user-focused):
- "Feedback commands are now available from the command palette — no more in-plugin forms"
- "Settings panel is cleaner — removed unnecessary dialogs"
- "Ko-fi support is now visible at a glance"

**Avoid** (technical):
- "Deprecated FeedbackModal, FeatureRequestModal, UninstallModal classes"
- "Removed UpdateModal lifecycle trigger on manifest version change"
- "Web-based feedback better aligns with Obsidian plugin guidelines"

## Translation examples

| What changed | How to write it |
|---|---|
| Removed old modal UI | "Settings are cleaner — removed in-plugin forms" |
| Added command palette commands | "Feedback commands are now available from the command palette" |
| Changed to web forms | "Feedback now opens a web form instead of an in-app dialog" |
| Fixed badge styling | "README badges are now consistent" |

## Process

1. Identify changes from `git log` / PR description since the last released version.
2. Group into What's new / What's better / What's fixed (skip empty groups).
3. Translate each into plain, user-facing language.
4. Write a short title and 1-2 sentence summary.
5. Apply with `gh release edit <version> --title "..." --notes "..."`.

## Example release notes

```
Title: v1.7.0 - Cleaner Feedback, Direct Web Forms

Simplified feedback so it opens a plain web form instead of an in-app dialog.

What's better
- Feedback commands are available from the command palette
- Settings panel is cleaner, with fewer dialogs
- README badges are now consistent

Update from Settings → Community plugins, or wait for auto-update.
```

## When to call this

Use this guide when:
- A version bump just landed a green CI run on `main` and needs release notes
- Rewriting existing release notes for clarity
- Translating technical changes into user-facing language
