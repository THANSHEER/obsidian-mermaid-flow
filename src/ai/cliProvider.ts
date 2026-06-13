/*
 * CLI AI provider — desktop only. Runs a local CLI tool (Claude Code, Codex,
 * Gemini CLI, or a custom command) in one-shot mode and captures stdout.
 *
 * Node access goes through window.require at call time (never static imports:
 * the bundle must stay loadable on mobile, where AiService refuses to build
 * this provider). Command templates are tokenized BEFORE placeholder
 * substitution, so prompt content can never be interpreted as extra arguments
 * or shell syntax — and no shell is involved at all (execFile).
 */

import { Platform } from "obsidian";
import { AiProvider, AiRequest, CliPresetId } from "./types";

export const CLI_PRESETS: Record<Exclude<CliPresetId, "custom">, string> = {
	claude: "claude -p {{prompt}}",
	codex: "codex exec --skip-git-repo-check {{image?-i {{image}}}} {{prompt}}",
	"gemini-cli": "gemini -p {{prompt}}",
};

export function presetTemplate(preset: CliPresetId, customTemplate: string): string {
	return preset === "custom" ? customTemplate : CLI_PRESETS[preset];
}

/**
 * Resolve `{{image?...}}` conditional segments: keep the inner text when an
 * image is attached, drop the segment otherwise. The inner text may itself
 * contain `{{image}}`.
 */
export function resolveImageConditionals(template: string, hasImage: boolean): string {
	return template
		.replace(/\{\{image\?(.*?)\}\}(?=\s|$)/g, (_m, inner: string) => (hasImage ? inner : ""))
		.replace(/\s{2,}/g, " ")
		.trim();
}

/** Split a command template into argv tokens, honouring double quotes. */
export function tokenizeTemplate(template: string): string[] {
	const tokens: string[] = [];
	const re = /"([^"]*)"|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(template)) !== null) {
		tokens.push(m[1] ?? m[2] ?? "");
	}
	return tokens;
}

/** Substitute placeholders inside already-tokenized argv entries. */
export function substituteTokens(
	tokens: string[],
	values: { prompt: string; image: string },
): string[] {
	return tokens.map((t) =>
		t.replace(/\{\{prompt\}\}/g, values.prompt).replace(/\{\{image\}\}/g, values.image),
	);
}

/** Build the final argv for a CLI invocation. Exported for tests. */
export function buildCliArgv(
	template: string,
	prompt: string,
	imagePath: string | null,
): string[] {
	let effective = resolveImageConditionals(template, imagePath !== null);
	let effectivePrompt = prompt;
	// CLIs without an image flag read files referenced in the prompt instead.
	if (imagePath !== null && !effective.includes("{{image}}")) {
		effectivePrompt = `Read the diagram image at ${imagePath}\n\n${prompt}`;
	}
	if (!effective.includes("{{prompt}}")) effective += " {{prompt}}";
	const tokens = tokenizeTemplate(effective);
	return substituteTokens(tokens, { prompt: effectivePrompt, image: imagePath ?? "" });
}

// --- desktop-only execution ---------------------------------------------------

interface NodeShims {
	execFile: (
		file: string,
		args: string[],
		opts: { timeout: number; maxBuffer: number; env: Record<string, string | undefined> },
		cb: (err: (Error & { code?: string; killed?: boolean }) | null, stdout: string, stderr: string) => void,
	) => void;
	writeFileSync: (path: string, data: unknown) => void;
	unlinkSync: (path: string) => void;
	tmpdir: () => string;
	joinPath: (...parts: string[]) => string;
	bufferFromBase64: (b64: string) => unknown;
	env: Record<string, string | undefined>;
}

function loadNodeShims(): NodeShims {
	const w = activeWindow as unknown as { require?: (id: string) => unknown };
	if (!Platform.isDesktopApp || typeof w.require !== "function") {
		throw new Error("CLI providers are only available on Obsidian desktop.");
	}
	const cp = w.require("child_process") as { execFile: NodeShims["execFile"] };
	const fs = w.require("fs") as {
		writeFileSync: NodeShims["writeFileSync"];
		unlinkSync: NodeShims["unlinkSync"];
	};
	const os = w.require("os") as { tmpdir: () => string; homedir: () => string };
	const path = w.require("path") as { join: (...p: string[]) => string };
	const proc = w.require("process") as { env: Record<string, string | undefined> };
	const buf = w.require("buffer") as {
		Buffer: { from: (s: string, enc: string) => unknown };
	};

	// GUI apps on macOS/Linux launch with a minimal PATH that misses the
	// directories CLIs are usually installed into.
	const extra = ["/usr/local/bin", "/opt/homebrew/bin", path.join(os.homedir(), ".local", "bin")];
	const current = proc.env.PATH ?? "";
	const merged = [...extra.filter((d) => !current.includes(d)), current].join(":");

	return {
		execFile: cp.execFile,
		writeFileSync: fs.writeFileSync,
		unlinkSync: fs.unlinkSync,
		tmpdir: os.tmpdir,
		joinPath: path.join,
		bufferFromBase64: (b64) => buf.Buffer.from(b64, "base64"),
		env: { ...proc.env, PATH: merged },
	};
}

const MIME_EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
};

export class CliProvider implements AiProvider {
	readonly id = "cli" as const;

	constructor(
		private preset: CliPresetId,
		private customTemplate: string,
		private timeoutSec: number,
	) {}

	async generate(req: AiRequest): Promise<string> {
		const shims = loadNodeShims();
		const template = presetTemplate(this.preset, this.customTemplate).trim();
		if (!template) throw new Error("CLI command template is empty — set it in settings.");

		let imagePath: string | null = null;
		if (req.imageBase64) {
			const ext = MIME_EXT[req.imageMime ?? ""] ?? "png";
			imagePath = shims.joinPath(shims.tmpdir(), `mermaid-flow-${Date.now()}.${ext}`);
			shims.writeFileSync(imagePath, shims.bufferFromBase64(req.imageBase64));
		}

		// CLIs take a single prompt; fold the system prompt into it.
		const prompt = `${req.system}\n\n${req.prompt}`;
		const argv = buildCliArgv(template, prompt, imagePath);
		const cmd = argv[0];
		if (!cmd) throw new Error("CLI command template is empty — set it in settings.");

		try {
			return await new Promise<string>((resolve, reject) => {
				shims.execFile(
					cmd,
					argv.slice(1),
					{
						timeout: this.timeoutSec * 1000,
						maxBuffer: 10 * 1024 * 1024,
						env: shims.env,
					},
					(err, stdout, stderr) => {
						if (err) {
							if (err.code === "ENOENT") {
								reject(new Error(`CLI '${cmd}' not found on PATH — is it installed?`));
							} else if (err.killed) {
								reject(new Error(`CLI '${cmd}' timed out after ${this.timeoutSec}s.`));
							} else {
								reject(new Error(`CLI '${cmd}' failed: ${(stderr || err.message).slice(0, 300)}`));
							}
							return;
						}
						resolve(stdout);
					},
				);
			});
		} finally {
			if (imagePath) {
				try { shims.unlinkSync(imagePath); } catch { /* temp file already gone */ }
			}
		}
	}
}
