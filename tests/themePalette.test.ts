import { describe, it, expect } from 'vitest';
import { resolveThemePalette } from '../src/themePalette';

describe('resolveThemePalette', () => {
	it('falls back to Obsidian theme vars with a Mermaid-purple border when no theme', () => {
		const p = resolveThemePalette({});
		expect(p.nodeFill).toBe('var(--background-primary-alt)');
		expect(p.nodeStroke).toBe('#9370db');
		expect(p.nodeText).toBe('var(--text-normal)');
		expect(p.lineColor).toBe('var(--text-muted)');
	});

	it('uses a built-in Mermaid palette for a named theme', () => {
		const p = resolveThemePalette({ theme: 'forest' });
		expect(p.nodeFill).toBe('#cde498');
		expect(p.nodeStroke).toBe('#13540c');
		expect(p.lineColor).toBe('#13540c');
	});

	it('mirrors explicit base themeVariables', () => {
		const p = resolveThemePalette({
			theme: 'base',
			themeVariables: {
				primaryColor: '#dff1ff',
				primaryBorderColor: '#1c7ed6',
				primaryTextColor: '#0b3d66',
				lineColor: '#1c7ed6',
			},
		});
		expect(p.nodeFill).toBe('#dff1ff');
		expect(p.nodeStroke).toBe('#1c7ed6');
		expect(p.nodeText).toBe('#0b3d66');
		expect(p.lineColor).toBe('#1c7ed6');
	});

	it('treats an unknown theme as the Obsidian default', () => {
		const p = resolveThemePalette({ theme: 'mystery-theme' });
		expect(p.nodeStroke).toBe('#9370db');
		expect(p.nodeFill).toBe('var(--background-primary-alt)');
	});
});
