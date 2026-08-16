# Release Notes Agent Guide

Use this when drafting or updating GitHub release notes for Mermaid Flow.

## Source of truth

`CHANGELOG.md` is the source of truth. GitHub Release notes are the matching
`CHANGELOG.md` section applied **verbatim** — same `### Features` /
`### Improvements` / `### Security` / `### Fixes` headings, same wording. Do
not reword, paraphrase, or translate into "What's new / What's better"
prose — that was tried and explicitly rejected. No `release.md` in this repo.
See CLAUDE.md's "Release & Changelog" section for the full flow.

- **Changes to document**: the `CHANGELOG.md` entry for the version, verified
  against `git diff <prev-tag>..<tag>` — commit/PR titles in this repo have
  historically misattributed which version a feature actually shipped in, so
  don't trust them alone.
- **Apply directly** to the CI-created draft release:
  `gh release edit <version> --title "vX.Y.Z - Title" --notes-file <path>` —
  title picked from the CHANGELOG entry, body is that entry's section content
  copied as-is (write it to a temp file and pass `--notes-file`, don't retype
  it inline where it's easy to drift). Never leave the auto-generated
  placeholder as the final release.

## Process

1. Add/update the `CHANGELOG.md` entry for the version first, grounded in the
   actual diff.
2. Extract that version's section from `CHANGELOG.md` (everything between its
   `## [X.Y.Z]` heading and the next one, minus the `---` separator) to a temp
   file.
3. `gh release edit <version> --title "vX.Y.Z - Title" --notes-file <path>`.
4. Diff the published body against the CHANGELOG.md section to confirm they
   match exactly (ignoring a trailing-newline difference GitHub adds).

## When to call this

Use this guide when:
- A version bump just landed a green CI run on `main` and needs release notes
- An existing release's notes don't match the current `CHANGELOG.md` entry
