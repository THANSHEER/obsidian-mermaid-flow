/*
 * Coverage check: every string passed to t("...") must have an entry in each
 * registered locale file under src/i18n/locales/.
 * Exits non-zero when something is missing, so it can gate a release.
 *
 * Usage: node scripts/i18n-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve("src");
const LOCALES_DIR = path.resolve("src/i18n/locales");

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
	"×",
	"+",
	"◆",
	"▾",
	"100%",
	"H",
	"W",
	"sk-…",
	"[[Note]] or https://…",
]);

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir)) {
		const full = path.join(dir, entry);
		const stat = fs.statSync(full);
		if (stat.isDirectory()) walk(full, out);
		else if (full.endsWith(".ts")) out.push(full);
	}
	return out;
}

function readDictionaryKeys(filePath) {
	const source = fs.readFileSync(filePath, "utf8");
	const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
	const entries = new Set();
	const visit = (node) => {
		if (ts.isObjectLiteralExpression(node)) {
			for (const prop of node.properties) {
				if (ts.isPropertyAssignment(prop)) {
					if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name) || ts.isIdentifier(prop.name)) {
						entries.add(prop.name.text);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return entries;
}

const keys = new Map();
for (const file of walk(ROOT)) {
	const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
	if (rel.startsWith("src/i18n/")) continue;
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

const localeFiles = fs
	.readdirSync(LOCALES_DIR)
	.filter((name) => name.endsWith(".ts") && name !== "index.ts")
	.sort();

let hasMissing = false;
console.log(`t() keys: ${keys.size}, locale files: ${localeFiles.length}`);

for (const fileName of localeFiles) {
	const localeName = fileName.replace(/\.ts$/, "");
	const dict = readDictionaryKeys(path.join(LOCALES_DIR, fileName));
	const missing = [...keys.entries()].filter(([key]) => !dict.has(key) && !ALLOW.has(key));
	const unused = [...dict].filter((key) => !keys.has(key));
	const required = [...keys.keys()].filter((key) => !ALLOW.has(key)).length;
	const translated = required - missing.length;
	const pct = required > 0 ? Math.round((translated / required) * 100) : 100;

	console.log(`\n[${localeName}] ${translated}/${required} translated (${pct}%), ${dict.size} entries`);
	if (missing.length) {
		hasMissing = true;
		console.log(`  MISSING (${missing.length}):`);
		for (const [key, file] of missing) console.log(`    ${JSON.stringify(key)}  <- ${file}`);
	} else {
		console.log("  all t() keys are translated");
	}
	if (unused.length) {
		console.log(`  unused dictionary entries (${unused.length}):`);
		for (const key of unused.slice(0, 40)) console.log(`    ${JSON.stringify(key)}`);
	}
}

process.exit(hasMissing ? 1 : 0);
