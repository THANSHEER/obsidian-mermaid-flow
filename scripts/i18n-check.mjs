/*
 * Coverage check: every string passed to t("...") must have a Chinese entry.
 * Exits non-zero when something is missing, so it can gate a release.
 *
 * Usage: node scripts/i18n-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve("src");

// English is intentional for these: product names, font stacks, symbols.
const ALLOW = new Set([
	"Solarized",
	"Arial",
	"Georgia",
	"Courier New",
	"Trebuchet MS",
	"Verdana",
	"matplotlib",
	"mermaid flow",
	"中文",
	"English",
	"×",
	"+",
	"◆",
	"▾",
	"100%",
	"(none)",
	"H",
	"W",
	"sk-…",
	"[[Note]] or https://…",
]);
const SKIP = new Set(["src/i18n/index.ts", "src/i18n/types.ts", "src/i18n/locales/zh-cn.ts"]);

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir)) {
		const full = path.join(dir, entry);
		const stat = fs.statSync(full);
		if (stat.isDirectory()) walk(full, out);
		else if (full.endsWith(".ts")) out.push(full);
	}
	return out;
}

const keys = new Map();
for (const file of walk(ROOT)) {
	const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
	if (SKIP.has(rel)) continue;
	const source = fs.readFileSync(file, "utf8");
	const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
	const visit = (node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "t" &&
			node.arguments.length
		) {
			const arg = node.arguments[0];
			if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
				keys.set(arg.text, rel);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
}

const dictSource = fs.readFileSync("src/i18n/locales/zh-cn.ts", "utf8");
const body = dictSource.slice(dictSource.indexOf("{") + 1, dictSource.lastIndexOf("}"));
const re = /(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_$][\w$]*))\s*:\s*"((?:[^"\\]|\\.)*)"/g;
const dict = new Map();
let m;
while ((m = re.exec(body))) dict.set(m[1] !== undefined ? m[1] : m[2], m[3]);

const missing = [...keys.entries()].filter(([key]) => !dict.has(key) && !ALLOW.has(key));
const unused = [...dict.keys()].filter((key) => !keys.has(key));

console.log(`t() keys: ${keys.size}, dictionary entries: ${dict.size}`);
if (missing.length) {
	console.log(`\nMISSING (${missing.length}):`);
	for (const [key, file] of missing) console.log(`  ${JSON.stringify(key)}  <- ${file}`);
} else {
	console.log("all t() keys are translated");
}
if (unused.length) {
	console.log(`\nunused dictionary entries (${unused.length}):`);
	for (const key of unused.slice(0, 40)) console.log(`  ${JSON.stringify(key)}`);
}

process.exit(missing.length ? 1 : 0);
