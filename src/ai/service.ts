/*
 * AiService — the single entry point the UI talks to. Picks the provider from
 * current settings, builds the prompt for the requested task, and validates
 * that the response parses as a flowchart before handing it back.
 */

import { Platform } from "obsidian";
import { mermaidToModel } from "../parser";
import type { MermaidFlowSettings } from "../settings";
import { CliProvider } from "./cliProvider";
import {
	AnthropicProvider,
	GeminiProvider,
	OpenAICompatProvider,
} from "./httpProviders";
import {
	SYSTEM_PROMPT,
	buildImagePrompt,
	buildImprovePrompt,
	buildTextPrompt,
	extractMermaid,
} from "./prompts";
import { AiProvider } from "./types";

export type AiTask =
	| { kind: "image"; imageBase64: string; imageMime: string; hint: string }
	| { kind: "text"; description: string }
	| { kind: "improve"; code: string; instruction: string };

export class AiService {
	constructor(private getSettings: () => MermaidFlowSettings) {}

	isEnabled(): boolean {
		return this.getSettings().ai.enabled;
	}

	/** True when the selected provider has what it needs to make a call. */
	isConfigured(): boolean {
		const ai = this.getSettings().ai;
		switch (ai.provider) {
			case "anthropic": return ai.anthropicApiKey.trim().length > 0;
			case "openai-compat": return ai.openaiBaseUrl.trim().length > 0;
			case "gemini": return ai.geminiApiKey.trim().length > 0;
			case "cli":
				return Platform.isDesktopApp &&
					(ai.cliPreset !== "custom" || ai.cliCustomTemplate.trim().length > 0);
		}
	}

	/** Human-readable hint shown when isConfigured() is false. */
	configurationHint(): string {
		const ai = this.getSettings().ai;
		if (ai.provider === "cli" && !Platform.isDesktopApp) {
			return "CLI providers only work on desktop. Pick an API provider in settings.";
		}
		return "Configure the AI provider in the Mermaid Flow settings first.";
	}

	async generateDiagram(task: AiTask): Promise<{ code: string; warnings: string[] }> {
		const provider = this.buildProvider();
		const req = this.buildRequest(task);
		const raw = await provider.generate(req);
		const code = extractMermaid(raw);
		const { model, warnings } = mermaidToModel(code);
		if (model.nodes.length === 0) {
			throw new Error("The AI did not return a recognizable flowchart. Try again or rephrase.");
		}
		return { code, warnings };
	}

	private buildRequest(task: AiTask): {
		prompt: string;
		system: string;
		imageBase64?: string;
		imageMime?: string;
	} {
		switch (task.kind) {
			case "image":
				return {
					prompt: buildImagePrompt(task.hint),
					system: SYSTEM_PROMPT,
					imageBase64: task.imageBase64,
					imageMime: task.imageMime,
				};
			case "text":
				return { prompt: buildTextPrompt(task.description), system: SYSTEM_PROMPT };
			case "improve":
				return { prompt: buildImprovePrompt(task.code, task.instruction), system: SYSTEM_PROMPT };
		}
	}

	private buildProvider(): AiProvider {
		const ai = this.getSettings().ai;
		switch (ai.provider) {
			case "anthropic":
				return new AnthropicProvider(ai.anthropicApiKey.trim(), ai.anthropicModel.trim());
			case "openai-compat":
				return new OpenAICompatProvider(
					ai.openaiApiKey,
					ai.openaiBaseUrl.trim(),
					ai.openaiModel.trim(),
				);
			case "gemini":
				return new GeminiProvider(ai.geminiApiKey.trim(), ai.geminiModel.trim());
			case "cli":
				if (!Platform.isDesktopApp) {
					throw new Error("CLI providers are only available on Obsidian desktop.");
				}
				return new CliProvider(ai.cliPreset, ai.cliCustomTemplate, ai.cliTimeoutSec);
		}
	}
}
