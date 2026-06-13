import { describe, it, expect, vi } from 'vitest';

// settings.ts imports value bindings from "obsidian"; stub them so the module
// can be imported outside the Obsidian runtime.
vi.mock('obsidian', () => ({
	App: class {},
	PluginSettingTab: class {},
	Setting: class {},
}));

import { DEFAULT_SETTINGS } from '../src/settings';

describe('DEFAULT_SETTINGS', () => {
	it('has the documented defaults', () => {
		expect(DEFAULT_SETTINGS).toMatchObject({
			openMode: 'modal',
			defaultDirection: 'TB',
			defaultShape: 'rect',
			savePositions: true,
			autoSave: true,
		});
	});

	it('ships AI defaults with all entry points enabled', () => {
		expect(DEFAULT_SETTINGS.ai).toMatchObject({
			enabled: true,
			provider: 'anthropic',
			showCommands: true,
			showToolbarButton: true,
			enableImageDrop: true,
		});
		expect(DEFAULT_SETTINGS.ai.openaiBaseUrl).toContain('https://');
		expect(DEFAULT_SETTINGS.ai.cliTimeoutSec).toBeGreaterThan(0);
	});

	it('merges loaded data over defaults like loadSettings does', () => {
		// mirrors `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`
		const loaded = { autoSave: false, defaultDirection: 'LR' as const };
		const merged = Object.assign({}, DEFAULT_SETTINGS, loaded);
		expect(merged.autoSave).toBe(false);
		expect(merged.defaultDirection).toBe('LR');
		expect(merged.openMode).toBe('modal'); // untouched default
	});

	it('deep-merges a partial saved ai block without masking new keys', () => {
		// mirrors the second merge line in loadSettings
		const saved = { ai: { provider: 'gemini', geminiApiKey: 'k' } };
		const ai = Object.assign({}, DEFAULT_SETTINGS.ai, saved.ai);
		expect(ai.provider).toBe('gemini');
		expect(ai.geminiApiKey).toBe('k');
		expect(ai.anthropicModel).toBe(DEFAULT_SETTINGS.ai.anthropicModel); // untouched default
		expect(ai.showCommands).toBe(true);
	});
});
