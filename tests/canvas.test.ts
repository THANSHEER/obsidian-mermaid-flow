// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { DiagramCanvas } from '../src/canvas';
import { emptyModel } from '../src/model';
import type { DiagramModel } from '../src/model';

// Obsidian globals (activeDocument, activeWindow, createDiv, createEl, etc.)
// are polyfilled for all tests in tests/setup.ts — do not duplicate here.

const SVG_NS = 'http://www.w3.org/2000/svg';

function render(model: DiagramModel): SVGSVGElement {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	const canvas = new DiagramCanvas(parent, model, { onSelect() {}, onChange() {} });
	return canvas.getSVG();
}

describe('DiagramCanvas rendering', () => {
	it('renders node labels as text, never as parsed HTML (XSS-safe)', () => {
		const model = emptyModel('LR');
		const payload = '<img src=x onerror="alert(1)">';
		model.nodes.push({ id: 'A', label: payload, shape: 'rect', x: 100, y: 60 });

		const svg = render(model);
		const label = svg.querySelector('.mermaid-flow-node-label');
		expect(label).not.toBeNull();
		expect(label!.textContent).toBe(payload); // the literal text is preserved
		expect(label!.querySelector('img')).toBeNull(); // and was NOT parsed into an element
		expect(label!.children.length).toBe(0);
	});

	it('builds the diagram in the SVG namespace via createElementNS', () => {
		const model = emptyModel('LR');
		model.nodes.push({ id: 'A', label: 'Hello', shape: 'rect', x: 100, y: 60 });
		model.nodes.push({ id: 'B', label: 'World', shape: 'diamond', x: 260, y: 60 });

		const svg = render(model);
		expect(svg.namespaceURI).toBe(SVG_NS);
		const labels = svg.querySelectorAll('.mermaid-flow-node-label');
		expect(labels).toHaveLength(2);
		expect(labels[0]!.namespaceURI).toBe(SVG_NS);
	});
});
