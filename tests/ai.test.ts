import { describe, it, expect, vi, beforeEach } from 'vitest';

// The AI modules import value bindings from "obsidian"; stub them so the
// modules can be imported outside the Obsidian runtime.
const requestUrlMock = vi.fn();
vi.mock('obsidian', () => ({
	App: class {},
	PluginSettingTab: class {},
	Setting: class {},
	Platform: { isDesktopApp: true },
	requestUrl: (...args: unknown[]) => requestUrlMock(...args),
}));

import {
	SYSTEM_PROMPT,
	buildImagePrompt,
	buildImprovePrompt,
	buildTextPrompt,
	extractMermaid,
} from '../src/ai/prompts';
import {
	buildAnthropicRequest,
	buildGeminiRequest,
	buildOpenAiRequest,
	parseAnthropicResponse,
	parseGeminiResponse,
	parseOpenAiResponse,
} from '../src/ai/httpProviders';
import {
	buildCliArgv,
	resolveImageConditionals,
	substituteTokens,
	tokenizeTemplate,
} from '../src/ai/cliProvider';
import { AiService } from '../src/ai/service';
import { DEFAULT_SETTINGS, MermaidFlowSettings } from '../src/settings';
import { AiRequest } from '../src/ai/types';

const FLOW = 'flowchart TB\n    A[Start] --> B[End]';

describe('extractMermaid', () => {
	it('returns clean input unchanged', () => {
		expect(extractMermaid(FLOW)).toBe(FLOW);
	});

	it('strips a ```mermaid fence', () => {
		expect(extractMermaid('```mermaid\n' + FLOW + '\n```')).toBe(FLOW);
	});

	it('strips a bare ``` fence', () => {
		expect(extractMermaid('```\n' + FLOW + '\n```')).toBe(FLOW);
	});

	it('skips leading prose before the flowchart line', () => {
		const raw = 'Here is your diagram:\n\n' + FLOW;
		expect(extractMermaid(raw)).toBe(FLOW);
	});

	it('handles prose + fence + trailing commentary', () => {
		const raw = 'Sure!\n```mermaid\n' + FLOW + '\n```\nLet me know if you need changes.';
		expect(extractMermaid(raw)).toBe(FLOW);
	});

	it('cuts unfenced trailing fence lines', () => {
		const raw = FLOW + '\n```';
		expect(extractMermaid(raw)).toBe(FLOW);
	});

	it('returns trimmed garbage as-is for downstream validation to reject', () => {
		expect(extractMermaid('  no diagram here  ')).toBe('no diagram here');
	});
});

describe('prompt builders', () => {
	it('image prompt includes the user hint when given', () => {
		expect(buildImagePrompt('use LR direction')).toContain('use LR direction');
		expect(buildImagePrompt('')).not.toContain('Additional instructions');
	});

	it('text prompt embeds the description', () => {
		expect(buildTextPrompt('login flow with retry')).toContain('login flow with retry');
	});

	it('improve prompt embeds the code and protects %% lines', () => {
		const p = buildImprovePrompt(FLOW, 'shorter labels');
		expect(p).toContain(FLOW);
		expect(p).toContain('shorter labels');
		expect(p).toContain('%%');
	});

	it('system prompt forbids fences and prose', () => {
		expect(SYSTEM_PROMPT).toContain('ONLY');
		expect(SYSTEM_PROMPT.toLowerCase()).toContain('no markdown fences');
	});
});

describe('HTTP provider request building', () => {
	const textReq: AiRequest = { prompt: 'p', system: 's' };
	const imageReq: AiRequest = {
		prompt: 'p', system: 's', imageBase64: 'AAAA', imageMime: 'image/png',
	};

	it('builds an Anthropic request with version header and system field', () => {
		const spec = buildAnthropicRequest(textReq, 'key', 'claude-sonnet-4-5');
		expect(spec.url).toBe('https://api.anthropic.com/v1/messages');
		expect(spec.headers['x-api-key']).toBe('key');
		expect(spec.headers['anthropic-version']).toBe('2023-06-01');
		expect(spec.body.system).toBe('s');
		expect(spec.body.model).toBe('claude-sonnet-4-5');
	});

	it('attaches base64 image blocks for Anthropic', () => {
		const spec = buildAnthropicRequest(imageReq, 'key', 'm');
		const content = (spec.body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]!.content;
		expect(content[0]).toMatchObject({
			type: 'image',
			source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
		});
		expect(content[1]).toMatchObject({ type: 'text', text: 'p' });
	});

	it('omits the Authorization header when the OpenAI key is empty', () => {
		const spec = buildOpenAiRequest(textReq, '  ', 'http://localhost:11434/v1/', 'llama3');
		expect(spec.headers.Authorization).toBeUndefined();
		expect(spec.url).toBe('http://localhost:11434/v1/chat/completions');
	});

	it('builds OpenAI data-URL image content with Bearer auth', () => {
		const spec = buildOpenAiRequest(imageReq, 'key', 'https://api.openai.com/v1', 'gpt-4o-mini');
		expect(spec.headers.Authorization).toBe('Bearer key');
		const messages = spec.body.messages as Array<{ role: string; content: unknown }>;
		expect(messages[0]).toMatchObject({ role: 'system', content: 's' });
		const userContent = messages[1]!.content as Array<Record<string, unknown>>;
		expect(userContent[1]).toMatchObject({
			type: 'image_url',
			image_url: { url: 'data:image/png;base64,AAAA' },
		});
	});

	it('builds a Gemini request with inline_data and model in URL', () => {
		const spec = buildGeminiRequest(imageReq, 'key', 'gemini-2.0-flash');
		expect(spec.url).toContain('models/gemini-2.0-flash:generateContent');
		expect(spec.headers['x-goog-api-key']).toBe('key');
		const parts = (spec.body.contents as Array<{ parts: Array<Record<string, unknown>> }>)[0]!.parts;
		expect(parts[0]).toMatchObject({ text: 'p' });
		expect(parts[1]).toMatchObject({ inline_data: { mime_type: 'image/png', data: 'AAAA' } });
	});
});

describe('HTTP provider response parsing', () => {
	it('joins Anthropic text blocks', () => {
		const json = { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] };
		expect(parseAnthropicResponse(json)).toBe('ab');
	});

	it('reads the first OpenAI choice', () => {
		expect(parseOpenAiResponse({ choices: [{ message: { content: 'x' } }] })).toBe('x');
	});

	it('joins Gemini candidate parts', () => {
		const json = { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] };
		expect(parseGeminiResponse(json)).toBe('ab');
	});

	it('throws on malformed shapes', () => {
		expect(() => parseAnthropicResponse({})).toThrow();
		expect(() => parseOpenAiResponse({ choices: [] })).toThrow();
		expect(() => parseGeminiResponse({ candidates: [] })).toThrow();
	});
});

describe('CLI template handling', () => {
	it('tokenizes respecting double quotes', () => {
		expect(tokenizeTemplate('claude -p "two words" {{prompt}}')).toEqual([
			'claude', '-p', 'two words', '{{prompt}}',
		]);
	});

	it('keeps a multi-word prompt as a single argv entry', () => {
		const argv = substituteTokens(['claude', '-p', '{{prompt}}'], {
			prompt: 'a "quoted" prompt; rm -rf /',
			image: '',
		});
		expect(argv).toEqual(['claude', '-p', 'a "quoted" prompt; rm -rf /']);
	});

	it('keeps the image conditional when an image is present', () => {
		const t = resolveImageConditionals('codex exec {{image?-i {{image}}}} {{prompt}}', true);
		expect(t).toBe('codex exec -i {{image}} {{prompt}}');
	});

	it('drops the image conditional when no image is present', () => {
		const t = resolveImageConditionals('codex exec {{image?-i {{image}}}} {{prompt}}', false);
		expect(t).toBe('codex exec {{prompt}}');
	});

	it('builds full argv with image flag substituted', () => {
		const argv = buildCliArgv(
			'codex exec --skip-git-repo-check {{image?-i {{image}}}} {{prompt}}',
			'make a diagram',
			'/tmp/x.png',
		);
		expect(argv).toEqual([
			'codex', 'exec', '--skip-git-repo-check', '-i', '/tmp/x.png', 'make a diagram',
		]);
	});

	it('folds the image path into the prompt for CLIs without an image flag', () => {
		const argv = buildCliArgv('claude -p {{prompt}}', 'make a diagram', '/tmp/x.png');
		expect(argv[0]).toBe('claude');
		expect(argv[2]).toContain('/tmp/x.png');
		expect(argv[2]).toContain('make a diagram');
	});

	it('appends {{prompt}} when a custom template forgot it', () => {
		const argv = buildCliArgv('mycli --flag', 'hello world', null);
		expect(argv).toEqual(['mycli', '--flag', 'hello world']);
	});
});

describe('AiService.generateDiagram', () => {
	const settings = (): MermaidFlowSettings => ({
		...DEFAULT_SETTINGS,
		ai: { ...DEFAULT_SETTINGS.ai, anthropicApiKey: 'key' },
	});

	beforeEach(() => requestUrlMock.mockReset());

	it('extracts, validates and returns fenced provider output', async () => {
		requestUrlMock.mockResolvedValue({
			status: 200,
			json: { content: [{ type: 'text', text: '```mermaid\n' + FLOW + '\n```' }] },
		});
		const svc = new AiService(settings);
		const { code, warnings } = await svc.generateDiagram({ kind: 'text', description: 'd' });
		expect(code).toBe(FLOW);
		expect(warnings).toEqual([]);
	});

	it('rejects prose-only responses', async () => {
		requestUrlMock.mockResolvedValue({
			status: 200,
			json: { content: [{ type: 'text', text: 'I cannot draw that, sorry.' }] },
		});
		const svc = new AiService(settings);
		await expect(
			svc.generateDiagram({ kind: 'text', description: 'd' }),
		).rejects.toThrow(/recognizable flowchart/);
	});

	it('surfaces HTTP errors with status and body', async () => {
		requestUrlMock.mockResolvedValue({ status: 401, text: 'invalid api key' });
		const svc = new AiService(settings);
		await expect(
			svc.generateDiagram({ kind: 'text', description: 'd' }),
		).rejects.toThrow(/HTTP 401.*invalid api key/);
	});

	it('reports unconfigured providers', () => {
		const svc = new AiService(() => DEFAULT_SETTINGS);
		expect(svc.isConfigured()).toBe(false); // anthropic with empty key
		const withKey = new AiService(settings);
		expect(withKey.isConfigured()).toBe(true);
	});
});
