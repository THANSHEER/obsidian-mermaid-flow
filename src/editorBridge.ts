/*
 * Reads and writes ```mermaid fenced code blocks in the active Markdown editor.
 */

import { Editor } from "obsidian";

export interface MermaidBlock {
	/** Line index of the opening fence (```mermaid). */
	fenceStart: number;
	/** Line index of the closing fence (```). */
	fenceEnd: number;
	/** The Mermaid source between the fences (no fence lines). */
	content: string;
}

const OPEN_FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/i;

function fenceCloseRe(marker: string): RegExp {
	const ch = marker[0] === "~" ? "~" : "`";
	const len = marker.length;
	return new RegExp(`^\\s*${ch}{${len},}\\s*$`);
}

/**
 * Find the mermaid block enclosing the cursor. Returns null if the cursor is
 * not inside one.
 */
export function findMermaidBlockAtCursor(editor: Editor): MermaidBlock | null {
	const cursorLine = editor.getCursor().line;
	const lineCount = editor.lineCount();

	// Walk up to find an opening fence whose block contains the cursor.
	for (let start = cursorLine; start >= 0; start--) {
		const text = editor.getLine(start);
		const open = text.match(OPEN_FENCE_RE);
		if (!open) continue;

		const marker = open[2] ?? "```";
		const closeRe = fenceCloseRe(marker);
		for (let end = start + 1; end < lineCount; end++) {
			if (closeRe.test(editor.getLine(end))) {
				// Cursor anywhere from the opening fence through the closing fence.
				if (cursorLine >= start && cursorLine <= end) {
					return {
						fenceStart: start,
						fenceEnd: end,
						content: readLines(editor, start + 1, end - 1),
					};
				}
				break; // this block does not contain the cursor
			}
		}
		// An opening fence with no close — stop searching upward.
		break;
	}

	return null;
}

function readLines(editor: Editor, from: number, to: number): string {
	if (to < from) return "";
	const parts: string[] = [];
	for (let i = from; i <= to; i++) parts.push(editor.getLine(i));
	return parts.join("\n");
}

/** Replace the inner content of an existing mermaid block. */
export function replaceBlockContent(
	editor: Editor,
	block: MermaidBlock,
	newContent: string,
): void {
	const from = { line: block.fenceStart + 1, ch: 0 };
	const lastInnerLine = block.fenceEnd - 1;
	const to =
		lastInnerLine >= block.fenceStart + 1
			? { line: lastInnerLine, ch: editor.getLine(lastInnerLine).length }
			: { line: block.fenceStart + 1, ch: 0 };

	if (block.fenceEnd - 1 < block.fenceStart + 1) {
		// Empty block: insert a fresh line of content.
		editor.replaceRange(
			newContent + "\n",
			{ line: block.fenceStart + 1, ch: 0 },
		);
	} else {
		editor.replaceRange(newContent, from, to);
	}
}

/** Insert a brand new fenced mermaid block at the cursor. */
export function insertBlockAtCursor(editor: Editor, fencedBlock: string): void {
	const cursor = editor.getCursor();
	const currentLine = editor.getLine(cursor.line);
	const needsLeadingNewline = currentLine.trim() !== "" && cursor.ch > 0;

	const prefix = needsLeadingNewline ? "\n\n" : "";
	const text = `${prefix}${fencedBlock}\n`;
	editor.replaceRange(text, cursor);

	// Move the cursor just past the inserted block.
	const insertedLines = text.split("\n").length - 1;
	editor.setCursor({ line: cursor.line + insertedLines, ch: 0 });
}
