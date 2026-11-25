/*
 * Minimal inline rich-text support for node/edge labels:
 * - HTML tags Mermaid renders inline (<b>/<strong>, <i>/<em>, <font color="...">)
 * - Markdown inline styling (**bold**, *italic*, ***bold italic***, __bold__,
 *   _italic_, ~~strike~~, `code`)
 *
 * Never uses innerHTML — tags and markers are tokenized and only their text
 * content is written back via textContent, so this can't inject markup into
 * the DOM. Diagram data in parser.ts / serializer.ts stays completely untouched.
 */

export interface InlineRun {
	text: string;
	bold?: boolean;
	italic?: boolean;
	color?: string;
	code?: boolean;
	strike?: boolean;
}

const TAG_RE = /<(\/?)(b|strong|i|em|font)\b([^>]*)>/gi;
const COLOR_ATTR_RE = /color\s*=\s*"([^"]*)"|color\s*=\s*'([^']*)'|color\s*=\s*([^\s"'>]+)/i;
const COLOR_STYLE_RE = /style\s*=\s*"[^"]*color:\s*([^;"]+)/i;

const MD_TOKEN_RE =
	/`([^`\n]+)`|\*\*\*([^\s*](?:[^*\n]*[^\s*])?)\*\*\*|___([^\s_](?:[^_\n]*[^\s_])?)___|\*\*([^\s*](?:[^*\n]*[^\s*])?)\*\*|__([^\s_](?:[^_\n]*[^\s_])?)__|~~([^\s~](?:[^~\n]*[^\s~])?)~~|\*([^\s*](?:[^*\n]*[^\s*])?)\*|(?<![A-Za-z0-9])_([^\s_](?:[^_\n]*[^\s_])?)_(?![A-Za-z0-9])/g;

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

interface StyleState {
	bold: boolean;
	italic: boolean;
	color: string | undefined;
	code?: boolean;
	strike?: boolean;
}

function pushRun(out: InlineRun[], text: string, style: StyleState): void {
	if (!text) return;
	out.push({
		text,
		bold: style.bold,
		italic: style.italic,
		color: style.color,
		...(style.code ? { code: true } : {}),
		...(style.strike ? { strike: true } : {}),
	});
}

function emitMarkdownRuns(text: string, style: StyleState, out: InlineRun[]): void {
	const re = new RegExp(MD_TOKEN_RE.source, "g");
	let lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		if (m.index > lastIndex) {
			pushRun(out, text.slice(lastIndex, m.index), style);
		}
		lastIndex = re.lastIndex;

		if (m[1] !== undefined) {
			// Inline `code` — render verbatim without nested markdown parsing.
			pushRun(out, m[1], { ...style, code: true });
		} else if (m[2] !== undefined || m[3] !== undefined) {
			emitMarkdownRuns(m[2] ?? m[3] ?? "", { ...style, bold: true, italic: true }, out);
		} else if (m[4] !== undefined || m[5] !== undefined) {
			emitMarkdownRuns(m[4] ?? m[5] ?? "", { ...style, bold: true }, out);
		} else if (m[6] !== undefined) {
			emitMarkdownRuns(m[6], { ...style, strike: true }, out);
		} else if (m[7] !== undefined || m[8] !== undefined) {
			emitMarkdownRuns(m[7] ?? m[8] ?? "", { ...style, italic: true }, out);
		}
	}
	if (lastIndex < text.length) {
		pushRun(out, text.slice(lastIndex), style);
	}
}

/**
 * Unwrap Mermaid's "`...`" markdown-string delimiter when the outer backticks
 * wrap a multi-word or formatted markdown expression rather than a single
 * inline code span.
 */
function unwrapMermaidMarkdownFence(line: string): string {
	if (line.length >= 2 && line.startsWith("`") && line.endsWith("`")) {
		const inner = line.slice(1, -1);
		if (!inner.includes("`") && /\s/.test(inner) && /[*_~<]/.test(inner)) {
			return inner;
		}
	}
	return line;
}

/** Parse a single line of label text into styled runs. Unsupported tags are
 *  left as literal text (matching the previous plain-text rendering). */
export function parseInlineMarkup(line: string): InlineRun[] {
	const normalized = unwrapMermaidMarkdownFence(line);
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
		emitMarkdownRuns(
			text,
			{
				bold: bold > 0,
				italic: italic > 0,
				color: colorStack[colorStack.length - 1],
			},
			runs,
		);
	};

	let m: RegExpExecArray | null;
	while ((m = TAG_RE.exec(normalized))) {
		pushText(normalized.slice(lastIndex, m.index));
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
	pushText(normalized.slice(lastIndex));

	return runs.length > 0 ? runs : [{ text: decodeEntities(normalized) }];
}

/** Strip all supported markup, for width measurement / plain-text contexts. */
export function plainTextFromMarkup(line: string): string {
	return parseInlineMarkup(line)
		.map((run) => run.text)
		.join("");
}
