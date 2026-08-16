/*
 * Minimal inline rich-text support for node/edge labels: a small, safe subset
 * of the HTML tags Mermaid itself renders inline (<b>/<strong>, <i>/<em>,
 * <font color="...">). Never uses innerHTML — tags are tokenized and only
 * their text content is written back via textContent, so this can't inject
 * markup into the DOM.
 */

export interface InlineRun {
	text: string;
	bold?: boolean;
	italic?: boolean;
	color?: string;
}

const TAG_RE = /<(\/?)(b|strong|i|em|font)\b([^>]*)>/gi;
const COLOR_ATTR_RE = /color\s*=\s*"([^"]*)"|color\s*=\s*'([^']*)'|color\s*=\s*([^\s"'>]+)/i;
const COLOR_STYLE_RE = /style\s*=\s*"[^"]*color:\s*([^;"]+)/i;

function decodeEntities(s: string): string {
	return s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");
}

/** Reject anything that isn't a plain color keyword/hex/rgb value — in
 *  particular unresolved `var(--...)`, which must never land in an SVG
 *  fill/stroke attribute. */
function sanitizeColor(color: string | undefined): string | undefined {
	if (!color) return undefined;
	const trimmed = color.trim();
	if (!trimmed || trimmed.toLowerCase().startsWith("var(")) return undefined;
	return trimmed;
}

function extractFontColor(attrs: string): string | undefined {
	const attrMatch = COLOR_ATTR_RE.exec(attrs);
	if (attrMatch) return sanitizeColor(attrMatch[1] || attrMatch[2] || attrMatch[3]);
	const styleMatch = COLOR_STYLE_RE.exec(attrs);
	if (styleMatch) return sanitizeColor(styleMatch[1]);
	return undefined;
}

/** Parse a single line of label text into styled runs. Unsupported tags are
 *  left as literal text (matching the previous plain-text rendering). */
export function parseInlineMarkup(line: string): InlineRun[] {
	const runs: InlineRun[] = [];
	let bold = 0;
	let italic = 0;
	const colorStack: Array<string | undefined> = [undefined];
	let lastIndex = 0;
	TAG_RE.lastIndex = 0;

	const pushText = (raw: string) => {
		if (!raw) return;
		const text = decodeEntities(raw);
		if (!text) return;
		runs.push({
			text,
			bold: bold > 0,
			italic: italic > 0,
			color: colorStack[colorStack.length - 1],
		});
	};

	let m: RegExpExecArray | null;
	while ((m = TAG_RE.exec(line))) {
		pushText(line.slice(lastIndex, m.index));
		lastIndex = TAG_RE.lastIndex;
		const closing = m[1] === "/";
		const tag = (m[2] ?? "").toLowerCase();
		const attrs = m[3] ?? "";
		if (tag === "b" || tag === "strong") {
			bold = Math.max(0, bold + (closing ? -1 : 1));
		} else if (tag === "i" || tag === "em") {
			italic = Math.max(0, italic + (closing ? -1 : 1));
		} else if (tag === "font") {
			if (closing) {
				if (colorStack.length > 1) colorStack.pop();
			} else {
				colorStack.push(extractFontColor(attrs) ?? colorStack[colorStack.length - 1]);
			}
		}
	}
	pushText(line.slice(lastIndex));

	return runs.length > 0 ? runs : [{ text: decodeEntities(line) }];
}

/** Strip all supported markup, for width measurement / plain-text contexts. */
export function plainTextFromMarkup(line: string): string {
	return decodeEntities(line.replace(/<[^>]+>/g, ""));
}
