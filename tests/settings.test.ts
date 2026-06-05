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

	it('ships a prompt template containing the {{text}} placeholder', () => {
		expect(DEFAULT_SETTINGS.promptTemplate).toContain('{{text}}');
	});

	it('merges loaded data over defaults like loadSettings does', () => {
		// mirrors `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`
		const loaded = { autoSave: false, defaultDirection: 'LR' as const };
		const merged = Object.assign({}, DEFAULT_SETTINGS, loaded);
		expect(merged.autoSave).toBe(false);
		expect(merged.defaultDirection).toBe('LR');
		expect(merged.openMode).toBe('modal'); // untouched default
	});
});
