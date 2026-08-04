/*
 * Text width measurement for node sizing. Uses a real canvas measureText when
 * available; falls back to a per-codepoint estimate where CJK/fullwidth
 * characters count double (the old chars × 8.2 heuristic underestimated them,
 * making wide labels overflow their shapes).
 */

const FALLBACK_CHAR_W = 8.2;

// Must stay in lockstep with the .mermaid-flow-node-label font in styles.css, so
// the box we size matches the text we draw. Mermaid's stock flowchart font/size,
// which the rendered diagram uses — measuring with it keeps the canvas boxes the
// same size as the render's.
const LABEL_FONT = '16px "trebuchet ms", verdana, arial, sans-serif';

let ctx: CanvasRenderingContext2D | null | undefined;

function isWide(cp: number): boolean {
	return (
		cp >= 0x1100 &&
		(cp <= 0x115f || // Hangul Jamo
			(cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals … Yi
			(cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
			(cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
			(cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
			(cp >= 0xff00 && cp <= 0xff60) || // Fullwidth forms
			(cp >= 0xffe0 && cp <= 0xffe6) ||
			cp >= 0x20000) // CJK extension B and beyond, emoji planes
	);
}

export function measureTextWidth(text: string, font: string = LABEL_FONT): number {
	if (ctx === undefined) {
		ctx = activeDocument.createElement("canvas").getContext("2d");
	}
	if (ctx) {
		ctx.font = font;
		const w = ctx.measureText(text).width;
		if (w > 0) return w;
	}
	let units = 0;
	for (const ch of text) {
		units += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
	}
	return units * FALLBACK_CHAR_W;
}
