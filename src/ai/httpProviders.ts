/*
 * HTTP AI providers: Anthropic, OpenAI-compatible (OpenAI / OpenRouter /
 * Ollama / LM Studio / any custom base URL) and Google Gemini.
 *
 * Each provider is split into pure buildRequest/parseResponse functions
 * (unit-testable without a network) plus a thin generate() that goes through
 * Obsidian's requestUrl (mobile-safe, no CORS restrictions).
 */

import { requestUrl } from "obsidian";
import { AiProvider, AiRequest } from "./types";

const MAX_TOKENS = 4096;

export interface HttpRequestSpec {
	url: string;
	headers: Record<string, string>;
	body: Record<string, unknown>;
}

async function postJson(spec: HttpRequestSpec): Promise<unknown> {
	const res = await requestUrl({
		url: spec.url,
		method: "POST",
		headers: { "Content-Type": "application/json", ...spec.headers },
		body: JSON.stringify(spec.body),
		throw: false,
	});
	if (res.status < 200 || res.status >= 300) {
		const detail = (res.text ?? "").slice(0, 300);
		throw new Error(`AI request failed (HTTP ${res.status}): ${detail}`);
	}
	return res.json;
}

// --- Anthropic ---------------------------------------------------------------

export function buildAnthropicRequest(
	req: AiRequest,
	apiKey: string,
	model: string,
): HttpRequestSpec {
	const content: unknown[] = [];
	if (req.imageBase64 && req.imageMime) {
		content.push({
			type: "image",
			source: { type: "base64", media_type: req.imageMime, data: req.imageBase64 },
		});
	}
	content.push({ type: "text", text: req.prompt });
	return {
		url: "https://api.anthropic.com/v1/messages",
		headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
		body: {
			model,
			max_tokens: MAX_TOKENS,
			system: req.system,
			messages: [{ role: "user", content }],
		},
	};
}

export function parseAnthropicResponse(json: unknown): string {
	const blocks = (json as { content?: Array<{ type: string; text?: string }> })?.content;
	if (!Array.isArray(blocks)) throw new Error("Unexpected Anthropic response shape.");
	return blocks
		.filter((b) => b.type === "text")
		.map((b) => b.text ?? "")
		.join("");
}

export class AnthropicProvider implements AiProvider {
	readonly id = "anthropic" as const;
	constructor(private apiKey: string, private model: string) {}

	async generate(req: AiRequest): Promise<string> {
		const json = await postJson(buildAnthropicRequest(req, this.apiKey, this.model));
		return parseAnthropicResponse(json);
	}
}

// --- OpenAI-compatible -------------------------------------------------------

export function buildOpenAiRequest(
	req: AiRequest,
	apiKey: string,
	baseUrl: string,
	model: string,
): HttpRequestSpec {
	let content: unknown = req.prompt;
	if (req.imageBase64 && req.imageMime) {
		content = [
			{ type: "text", text: req.prompt },
			{
				type: "image_url",
				image_url: { url: `data:${req.imageMime};base64,${req.imageBase64}` },
			},
		];
	}
	const headers: Record<string, string> = {};
	// Local servers (Ollama, LM Studio) take no key; skip the header entirely.
	if (apiKey.trim()) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
	return {
		url: `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
		headers,
		body: {
			model,
			max_tokens: MAX_TOKENS,
			messages: [
				{ role: "system", content: req.system },
				{ role: "user", content },
			],
		},
	};
}

export function parseOpenAiResponse(json: unknown): string {
	const text = (json as { choices?: Array<{ message?: { content?: string } }> })
		?.choices?.[0]?.message?.content;
	if (typeof text !== "string") throw new Error("Unexpected OpenAI-compatible response shape.");
	return text;
}

export class OpenAICompatProvider implements AiProvider {
	readonly id = "openai-compat" as const;
	constructor(private apiKey: string, private baseUrl: string, private model: string) {}

	async generate(req: AiRequest): Promise<string> {
		const json = await postJson(
			buildOpenAiRequest(req, this.apiKey, this.baseUrl, this.model),
		);
		return parseOpenAiResponse(json);
	}
}

// --- Google Gemini -----------------------------------------------------------

export function buildGeminiRequest(
	req: AiRequest,
	apiKey: string,
	model: string,
): HttpRequestSpec {
	const parts: unknown[] = [{ text: req.prompt }];
	if (req.imageBase64 && req.imageMime) {
		parts.push({ inline_data: { mime_type: req.imageMime, data: req.imageBase64 } });
	}
	return {
		url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
		headers: { "x-goog-api-key": apiKey },
		body: {
			systemInstruction: { parts: [{ text: req.system }] },
			contents: [{ parts }],
			generationConfig: { maxOutputTokens: MAX_TOKENS },
		},
	};
}

export function parseGeminiResponse(json: unknown): string {
	const parts = (json as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	})?.candidates?.[0]?.content?.parts;
	if (!Array.isArray(parts)) throw new Error("Unexpected Gemini response shape.");
	return parts.map((p) => p.text ?? "").join("");
}

export class GeminiProvider implements AiProvider {
	readonly id = "gemini" as const;
	constructor(private apiKey: string, private model: string) {}

	async generate(req: AiRequest): Promise<string> {
		const json = await postJson(buildGeminiRequest(req, this.apiKey, this.model));
		return parseGeminiResponse(json);
	}
}
