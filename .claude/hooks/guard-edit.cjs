#!/usr/bin/env node
/*
 * PostToolUse guard for Mermaid Flow.
 *
 * Runs after Claude writes/edits a file and checks AI-generated code against the
 * four Obsidian community-plugin audit rules from CLAUDE.md (the ones that block
 * plugin listing) plus manifest/version sync. It is a FAST regex guard — not a
 * replacement for `npm run lint && npm run build`, but an instant feedback loop
 * so violations get fixed in the same turn instead of surfacing in CI.
 *
 * On a violation it prints {"decision":"block","reason":...} which Claude Code
 * feeds back to the model so it self-corrects; the edit itself is NOT reverted.
 * Clean files exit 0 silently.
 *
 * Written in plain Node (guaranteed present in this repo) to avoid a jq dependency.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function readStdin() {
	try {
		return fs.readFileSync(0, "utf8");
	} catch {
		return "";
	}
}

let payload = {};
try {
	payload = JSON.parse(readStdin() || "{}");
} catch {
	process.exit(0); // not our problem — never block on a parse hiccup
}

const file =
	(payload.tool_input && payload.tool_input.file_path) ||
	(payload.tool_response && payload.tool_response.filePath) ||
	"";
if (!file) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const base = path.basename(file);
const rel = path.isAbsolute(file) ? path.relative(projectDir, file) : file;
const isSrcTs = /\.ts$/.test(file) && /(^|[/\\])src[/\\]/.test(file);
const isCss = /\.css$/.test(file);
const isManifest = base === "manifest.json" || base === "package.json";

const violations = [];

/** Scan each line with `re`; record a violation with an actionable fix hint. */
function scan(src, re, label, fix, skipComments) {
	src.split("\n").forEach((line, i) => {
		const t = line.trim();
		if (
			skipComments &&
			(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"))
		) {
			return;
		}
		if (re.test(line)) {
			violations.push(
				`  ${rel}:${i + 1}  ${label}\n      ${t.slice(0, 100)}\n      → ${fix}`,
			);
		}
	});
}

if (isSrcTs || isCss || isManifest) {
	let src = "";
	try {
		src = fs.readFileSync(file, "utf8");
	} catch {
		process.exit(0); // file vanished / unreadable — don't block
	}

	if (isSrcTs) {
		// Rule 1 — bare `document.` (capital-D names like activeDocument/ownerDocument
		// don't match the lowercase `document`).
		scan(
			src,
			/(^|[^A-Za-z_.])document\s*\./,
			"Rule 1: bare `document.` breaks in popout windows",
			"use the `activeDocument` global (no import needed)",
			true,
		);
		// Rule 2 — direct `.style.x =` assignment.
		scan(
			src,
			/\.style\.[A-Za-z_$][\w$]*\s*=(?!=)/,
			"Rule 2: direct `.style.*` assignment",
			"setAttribute() on SVG (e.g. setAttribute('fill', …)), or toggle a CSS class via classList on HTML",
			true,
		);
		// Rule 3 — bare `void` operator on a promise/call.
		scan(
			src,
			/(^|[^.\w])void\s+(this\.|[A-Za-z_$][\w$]*\s*\()/,
			"Rule 3: bare `void` discards a promise rejection",
			"chain .catch((e) => console.error('[mermaid-flow]', e)) instead",
			true,
		);
	}

	if (isCss) {
		// Rule 4 — !important.
		scan(
			src,
			/!important/,
			"Rule 4: `!important` in CSS",
			"raise specificity instead (e.g. chain `.modal.mermaid-flow-modal`)",
			false,
		);
	}

	if (isManifest) {
		// Version sync: manifest.json version must equal package.json version.
		try {
			execFileSync("node", ["scripts/validate-manifest.cjs"], {
				cwd: projectDir,
				stdio: "pipe",
			});
		} catch (e) {
			const out = (
				(e.stdout && e.stdout.toString()) +
				(e.stderr && e.stderr.toString())
			).trim();
			violations.push(
				`  ${rel}  manifest/version validation failed\n      ${out.slice(0, 300)}\n      → keep manifest.json and package.json versions in sync (use \`npm version <v>\`)`,
			);
		}
	}
}

if (violations.length === 0) process.exit(0);

const reason =
	`🛡️ Mermaid Flow guard flagged ${violations.length} audit-rule issue(s) — these block Obsidian community-plugin listing, fix before moving on:\n\n` +
	violations.join("\n\n") +
	`\n\nSee CLAUDE.md "Obsidian coding standards". Re-run \`npm run lint\` after fixing.`;

process.stdout.write(
	JSON.stringify({
		decision: "block",
		reason,
		systemMessage: `Mermaid Flow guard: ${violations.length} audit issue(s) in ${rel}`,
	}),
);
process.exit(0);
