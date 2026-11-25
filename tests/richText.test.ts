import { describe, expect, it } from "vitest";
import { parseInlineMarkup, plainTextFromMarkup } from "../src/richText";

describe("richText inline markup (HTML + Markdown)", () => {
	it("parses HTML rich-text tags as before", () => {
		expect(parseInlineMarkup('<b>Bold</b> and <font color="#e11d48"><i>Red</i></font>')).toEqual([
			{ text: "Bold", bold: true, italic: false, color: undefined },
			{ text: " and ", bold: false, italic: false, color: undefined },
			{ text: "Red", bold: false, italic: true, color: "#e11d48" },
		]);
	});

	it("parses Markdown bold, italic, bold-italic, strike, and inline code", () => {
		expect(parseInlineMarkup("**bold** *italic* ***both*** ~~gone~~ `fn()`")).toEqual([
			{ text: "bold", bold: true, italic: false, color: undefined },
			{ text: " ", bold: false, italic: false, color: undefined },
			{ text: "italic", bold: false, italic: true, color: undefined },
			{ text: " ", bold: false, italic: false, color: undefined },
			{ text: "both", bold: true, italic: true, color: undefined },
			{ text: " ", bold: false, italic: false, color: undefined },
			{ text: "gone", bold: false, italic: false, color: undefined, strike: true },
			{ text: " ", bold: false, italic: false, color: undefined },
			{ text: "fn()", bold: false, italic: false, color: undefined, code: true },
		]);
	});

	it("supports mixing HTML tags and Markdown syntax", () => {
		expect(parseInlineMarkup('<font color="blue">**Blue Bold**</font>')).toEqual([
			{ text: "Blue Bold", bold: true, italic: false, color: "blue" },
		]);
	});

	it("supports Mermaid markdown-string backtick wrapper", () => {
		expect(parseInlineMarkup("`**Step 1** and *Step 2*`")).toEqual([
			{ text: "Step 1", bold: true, italic: false, color: undefined },
			{ text: " and ", bold: false, italic: false, color: undefined },
			{ text: "Step 2", bold: false, italic: true, color: undefined },
		]);
	});

	it("does not italicize snake_case identifiers or math asterisks", () => {
		expect(parseInlineMarkup("user_id_1 and 2 * 3 * 4")).toEqual([
			{ text: "user_id_1 and 2 * 3 * 4", bold: false, italic: false, color: undefined },
		]);
	});

	it("strips both HTML and Markdown markup in plainTextFromMarkup()", () => {
		expect(plainTextFromMarkup("<b>Hello</b> **world** `ok` ~~no~~")).toBe("Hello world ok no");
	});
});
