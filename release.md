# Release Notes Guide

Use this file as the reusable instruction sheet for writing releases in this
repo or in other repos that want the same release structure.

## Purpose

- `CHANGELOG.md` is the source of truth.
- The same release notes can also be reused for GitHub Releases.
- Write release notes for users, not for maintainers.
- Focus on what improved: faster, safer, easier, cleaner, more reliable.

## Required Structure

Each version section should follow this shape:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### [emoji] vX.Y.Z - Value Proposition, Key Benefit

1-2 sentence summary paragraph written for users.

### ✨ New

- Brand-new commands or major capabilities

### 🚀 Features

- User-facing feature additions

### 💡 Improvements

- Enhancements to existing behavior, performance, or design

### 🐛 Bug Fixes

- Resolved bugs

### ⚠️ Known Issues

- Optional known limitations

---

**Upgrade:** `npm install -g mdgarden@latest` or run `mdgarden update`

No breaking changes.
```

## Section Rules

Only include sections that actually have content.

- `✨ New` for brand-new commands or major capabilities
- `🚀 Features` for user-facing feature additions
- `💡 Improvements` for enhancements to existing behavior, performance, design, or reliability
- `🐛 Bug Fixes` for resolved bugs
- `⚠️ Known Issues` only when there are real known limitations to call out

Do not keep empty headings.

## Title Rules

Format:

```markdown
### [emoji] vX.Y.Z - [Value Proposition], [Key Benefit]
```

Guidelines:

- Use 1-2 relevant emojis
- Keep it to about 10-12 words
- Lead with user value, not implementation details
- Make it sound like a release headline, not an internal changelog

Examples:

- `### 🔒 v0.5.0 - Security Hardening, Automated Updates`
- `### 🎨 v0.4.0 - Beautiful Redesign, Faster Builds`
- `### 🔗 v0.3.0 - Auto-Updates, Smart Link Previews`

## Summary Paragraph Rules

Add a short 1-2 sentence paragraph right below the release title.

Good summary traits:

- explains the main user benefit
- mentions the overall theme of the release
- avoids deep technical details
- clearly says if there are no breaking changes when helpful

## Writing Style

Write for end users.

- Use conversational language
- Focus on outcomes, not implementation
- Keep each bullet to 1 sentence
- Avoid jargon where possible
- Keep the full release concise, ideally around 1 page or less

Prefer this:

- "Safer release process with auto-expiring tokens"
- "Continuous security checking"
- "Automatic dependency updates"

Avoid this:

- "OIDC trusted publishing"
- "CodeQL and npm audit integration"
- "Dependabot configuration updates"

## Technical-to-User Translation

Use this style when converting internal work into public release notes:

| Technical change | User-facing wording |
| --- | --- |
| OIDC Trusted Publishing | Safer release process with auto-expiring tokens |
| CodeQL + npm audit scanning | Continuous security checking |
| Dependabot PRs | Automatic dependency updates |
| Explicit job permissions | Tighter security controls |
| Credential handling changes | Improved credential safety |

## Footer Rules

End every normal release with:

```markdown
---

**Upgrade:** `npm install -g mdgarden@latest` or run `mdgarden update`

No breaking changes.
```

If there are breaking changes, replace the last line with a clear migration or
upgrade note.

## Copy-Paste Template

```markdown
## [X.Y.Z] - YYYY-MM-DD

### [emoji] vX.Y.Z - Value Proposition, Key Benefit

Write 1-2 short sentences summarizing the release in user-focused language.

### ✨ New

- Add bullets only if this section applies

### 🚀 Features

- Add bullets only if this section applies

### 💡 Improvements

- Add bullets only if this section applies

### 🐛 Bug Fixes

- Add bullets only if this section applies

### ⚠️ Known Issues

- Add bullets only if this section applies

---

**Upgrade:** `npm install -g mdgarden@latest` or run `mdgarden update`

No breaking changes.
```

## Checklist Before Publishing

- Version heading matches `## [X.Y.Z] - YYYY-MM-DD`
- Title follows `### [emoji] vX.Y.Z - ...`
- Summary is 1-2 sentences
- Only relevant sections are included
- Every bullet is user-facing and single-sentence
- Empty sections are removed
- Footer is present
- Wording focuses on benefits instead of implementation details
