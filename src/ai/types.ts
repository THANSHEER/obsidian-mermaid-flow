/*
 * Shared types for the AI assistance feature: provider abstraction and the
 * settings block persisted under MermaidFlowSettings.ai.
 */

export type AiProviderId = "anthropic" | "openai-compat" | "gemini" | "cli";

export type CliPresetId = "claude" | "codex" | "gemini-cli" | "custom";

export interface AiRequest {
	/** Full user prompt (task instructions + any user input/diagram code). */
	prompt: string;
	/** System prompt constraining output format. */
	system: string;
	imageBase64?: string;
	imageMime?: string;
}

export interface AiProvider {
	readonly id: AiProviderId;
	/** Returns raw model output; fence-stripping/validation happens in AiService. */
	generate(req: AiRequest): Promise<string>;
}

export interface AiSettings {
	enabled: boolean;
	provider: AiProviderId;
	anthropicApiKey: string;
	anthropicModel: string;
	openaiApiKey: string;
	openaiBaseUrl: string;
	openaiModel: string;
	geminiApiKey: string;
	geminiModel: string;
	cliPreset: CliPresetId;
	cliCustomTemplate: string;
	cliTimeoutSec: number;
	showCommands: boolean;
	showToolbarButton: boolean;
	enableImageDrop: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
	enabled: true,
	provider: "anthropic",
	anthropicApiKey: "",
	anthropicModel: "claude-sonnet-4-5",
	openaiApiKey: "",
	openaiBaseUrl: "https://api.openai.com/v1",
	openaiModel: "gpt-4o-mini",
	geminiApiKey: "",
	geminiModel: "gemini-2.0-flash",
	cliPreset: "claude",
	cliCustomTemplate: "",
	cliTimeoutSec: 120,
	showCommands: true,
	showToolbarButton: true,
	enableImageDrop: true,
};
