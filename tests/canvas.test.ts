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

	it('vertically centres node labels at the node centre (not at y=0)', () => {
		const model = emptyModel('LR');
		model.nodes.push({ id: 'A', label: 'Hello', shape: 'rect', x: 100, y: 60 });

		const svg = render(model);
		const label = svg.querySelector('.mermaid-flow-node-label');
		expect(label).not.toBeNull();
		expect(label!.getAttribute('x')).toBe('100');
		expect(label!.getAttribute('y')).toBe('60'); // tracks node.y, not the default 0
		expect(label!.getAttribute('dominant-baseline')).toBe('central');
	});

	it('renders multi-line labels as one tspan per line, centred', () => {
		const model = emptyModel('LR');
		// Parser decodes <br/> → \n; SVG <text> ignores \n, so we emit tspans.
		model.nodes.push({ id: 'A', label: 'Line one\nLine two', shape: 'rect', x: 100, y: 60 });

		const svg = render(model);
		const label = svg.querySelector('.mermaid-flow-node-label');
		expect(label).not.toBeNull();
		const tspans = label!.querySelectorAll('tspan');
		expect(tspans).toHaveLength(2);
		expect(tspans[0]!.namespaceURI).toBe(SVG_NS);
		expect(tspans[0]!.textContent).toBe('Line one');
		expect(tspans[1]!.textContent).toBe('Line two');
		// each line re-anchors to the node centre
		expect(tspans[0]!.getAttribute('x')).toBe('100');
		expect(tspans[1]!.getAttribute('x')).toBe('100');
		// still plain text — never parsed as HTML
		expect(label!.querySelector('img')).toBeNull();
	});

	it('paints node shapes with the theme palette by default', () => {
		const model = emptyModel('LR');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60 });

		const svg = render(model);
		const shape = svg.querySelector('.mermaid-flow-shape');
		expect(shape).not.toBeNull();
		// No-theme default: Obsidian fill + Mermaid's stock purple border, set via
		// setAttribute (the base CSS fill/stroke was removed so these win).
		expect(shape!.getAttribute('fill')).toBe('var(--background-primary-alt)');
		expect(shape!.getAttribute('stroke')).toBe('#9370db');
		const label = svg.querySelector('.mermaid-flow-node-label');
		expect(label!.getAttribute('fill')).toBe('var(--text-normal)');
	});

	it('lets an explicit node style override the theme palette', () => {
		const model = emptyModel('LR');
		model.nodes.push({
			id: 'A',
			label: 'A',
			shape: 'rect',
			x: 100,
			y: 60,
			style: { fillColor: '#ff0000', strokeColor: '#00ff00', textColor: '#0000ff' },
		});

		const svg = render(model);
		const shape = svg.querySelector('.mermaid-flow-shape');
		expect(shape!.getAttribute('fill')).toBe('#ff0000');
		expect(shape!.getAttribute('stroke')).toBe('#00ff00');
		expect(svg.querySelector('.mermaid-flow-node-label')!.getAttribute('fill')).toBe('#0000ff');
	});

	it('colours edges with the theme line colour by default', () => {
		const model = emptyModel('LR');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 400, y: 60 });
		model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label: '' });

		const svg = render(model);
		const line = svg.querySelector('.mermaid-flow-edge-line');
		expect(line!.getAttribute('stroke')).toBe('var(--text-muted)');
	});

	it('uses a built-in Mermaid palette when the diagram sets a theme', () => {
		const model = emptyModel('LR');
		model.config.theme = 'forest';
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60 });

		const svg = render(model);
		const shape = svg.querySelector('.mermaid-flow-shape');
		expect(shape!.getAttribute('fill')).toBe('#cde498');
		expect(shape!.getAttribute('stroke')).toBe('#13540c');
	});

	it('sizes the edge-label background from measured text width', () => {
		// jsdom has no canvas 2d context, so measureTextWidth falls back to its
		// deterministic per-character estimate (8.2 units; CJK counts double).
		const buildWith = (label: string): number => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60 });
			model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 400, y: 60 });
			model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label });
			const svg = render(model);
			const bg = svg.querySelector('.mermaid-flow-edge-label-bg');
			expect(bg).not.toBeNull();
			return Number(bg!.getAttribute('width'));
		};

		expect(buildWith('go')).toBeCloseTo(2 * 8.2 + 12, 3);
		expect(buildWith('a much longer edge label')).toBeCloseTo(24 * 8.2 + 12, 3);
		// CJK characters count double in the fallback estimate.
		expect(buildWith('確認')).toBeCloseTo(4 * 8.2 + 12, 3);
	});

	it('applies classDef styles to nodes carrying the class', () => {
		const model = emptyModel('LR');
		model.classDefs.push({ name: 'hot', style: { fillColor: '#f96', strokeColor: '#333' } });
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60, classes: ['hot'] });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 260, y: 60 });

		const svg = render(model);
		const shapes = svg.querySelectorAll('.mermaid-flow-shape');
		expect(shapes[0]!.getAttribute('fill')).toBe('#f96');
		expect(shapes[0]!.getAttribute('stroke')).toBe('#333');
		expect(shapes[1]!.getAttribute('fill')).not.toBe('#f96');
	});
});

describe('DiagramCanvas curved edges', () => {
	function edgeModel(): DiagramModel {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 100, y: 240 });
		return model;
	}

	it('renders edges as cubic-bezier paths with a matching hit path', () => {
		const model = edgeModel();
		model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label: '' });

		const svg = render(model);
		const line = svg.querySelector('.mermaid-flow-edge-line')!;
		const hit = svg.querySelector('.mermaid-flow-edge-hit')!;
		expect(line.tagName).toBe('path');
		expect(hit.tagName).toBe('path');
		expect(line.getAttribute('d')).toMatch(/^M [\d.-]+ [\d.-]+ C /);
		expect(hit.getAttribute('d')).toBe(line.getAttribute('d'));
	});

	it('separates parallel edges with distinct paths', () => {
		const model = edgeModel();
		model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label: '' });
		model.edges.push({ id: 'e2', from: 'B', to: 'A', kind: 'arrow', label: '' });

		const svg = render(model);
		const paths = svg.querySelectorAll('.mermaid-flow-edge-line');
		expect(paths).toHaveLength(2);
		expect(paths[0]!.getAttribute('d')).not.toBe(paths[1]!.getAttribute('d'));
	});

	it('renders a visible self-loop for A --> A', () => {
		const model = edgeModel();
		model.edges.push({ id: 'e1', from: 'A', to: 'A', kind: 'arrow', label: '' });

		const svg = render(model);
		const path = svg.querySelector('.mermaid-flow-edge-line')!;
		const d = path.getAttribute('d')!;
		expect(d).toMatch(/^M /);
		// The loop departs and returns at different points (not degenerate).
		const m = d.match(/^M ([\d.-]+) ([\d.-]+) C .* ([\d.-]+) ([\d.-]+)$/);
		expect(m).not.toBeNull();
		expect(path.getAttribute('marker-end')).toBe('url(#mermaid-flow-arrow)');
	});

	it('sets arrow markers per edge kind', () => {
		const model = edgeModel();
		model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label: '' });
		model.edges.push({ id: 'e2', from: 'B', to: 'A', kind: 'open', label: '' });

		const svg = render(model);
		const paths = svg.querySelectorAll('.mermaid-flow-edge-line');
		expect(paths[0]!.getAttribute('marker-end')).toBe('url(#mermaid-flow-arrow)');
		expect(paths[1]!.getAttribute('marker-end')).toBeNull();
	});

	it('applies the marching-ants class to animated edges', () => {
		const model = edgeModel();
		model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label: '', animated: true });

		const svg = render(model);
		const path = svg.querySelector('.mermaid-flow-edge-line')!;
		expect(path.classList.contains('is-animated')).toBe(true);
	});
});

describe('DiagramCanvas zoom', () => {
	it('allows zooming out to 10% so large diagrams can fit on open', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const model = emptyModel('LR');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60 });
		const canvas = new DiagramCanvas(parent, model, { onSelect() {}, onChange() {} });

		for (let i = 0; i < 40; i++) canvas.zoomOut();
		expect(canvas.getZoom()).toBeCloseTo(0.1, 5);
	});
});
