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

/**
 * Like render(), but also returns the canvas instance for tests that need to
 * drive interaction (select/drag) rather than just inspect static markup.
 *
 * In jsdom, SVGSVGElement.getBoundingClientRect() always reports a zero rect,
 * which collapses toSvgPoint()'s client->SVG conversion to an identity
 * mapping (scale 1, origin 0) as long as the diagram has no negative-
 * coordinate content (vbX/vbY stay 0, the common case) — so PointerEvent
 * clientX/clientY can be asserted against directly as SVG coordinates.
 */
function setup(model: DiagramModel): { canvas: DiagramCanvas; svg: SVGSVGElement } {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	const canvas = new DiagramCanvas(parent, model, { onSelect() {}, onChange() {} });
	return { canvas, svg: canvas.getSVG() };
}

function pointer(
	type: string,
	x: number,
	y: number,
	opts: Partial<PointerEventInit> = {},
): PointerEvent {
	return new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, ...opts });
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
		// setAttribute (the base CSS fill/stroke was removed so these win). jsdom
		// can't resolve CSS custom properties, so resolveColor() falls back to the
		// concrete BUILTIN.default hex values — never the raw var() token, which
		// would render as invisible black (see the blanket regression test below).
		expect(shape!.getAttribute('fill')).toBe('#ececff');
		expect(shape!.getAttribute('stroke')).toBe('#9370db');
		const label = svg.querySelector('.mermaid-flow-node-label');
		expect(label!.getAttribute('fill')).toBe('#333333');
	});

	it('never leaves an unresolved var(...) token in any rendered fill/stroke attribute', () => {
		const model = emptyModel('LR');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'diamond', x: 300, y: 60 });
		model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label: 'go' });

		const svg = render(model);
		const offenders: string[] = [];
		svg.querySelectorAll('*').forEach((el) => {
			for (const attr of ['fill', 'stroke']) {
				const v = el.getAttribute(attr);
				if (v && v.includes('var(')) {
					offenders.push(`${el.tagName}[${attr}]="${v}"`);
				}
			}
		});
		expect(offenders).toEqual([]);
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

	it('renders supported inline markup (<b>, <i>, <font color>) as styled tspans', () => {
		const model = emptyModel('LR');
		model.nodes.push({
			id: 'A',
			label: 'plain <b>bold</b> <i>italic</i> <font color="#ff0000">red</font>',
			shape: 'rect',
			x: 100,
			y: 60,
		});

		const svg = render(model);
		const label = svg.querySelector('.mermaid-flow-node-label');
		expect(label).not.toBeNull();
		// still plain text overall — no unsupported elements
		expect(label!.textContent).toBe('plain bold italic red');
		expect(label!.querySelector('img')).toBeNull();

		const runs = Array.from(label!.querySelectorAll('tspan'));
		const bold = runs.find((r) => r.textContent === 'bold');
		const italic = runs.find((r) => r.textContent === 'italic');
		const red = runs.find((r) => r.textContent === 'red');
		expect(bold!.getAttribute('font-weight')).toBe('bold');
		expect(italic!.getAttribute('font-style')).toBe('italic');
		expect(red!.getAttribute('fill')).toBe('#ff0000');
	});

	it('never lets an inline <font color="var(...)"> reach an SVG fill attribute', () => {
		const model = emptyModel('LR');
		model.nodes.push({
			id: 'A',
			label: '<font color="var(--text-error)">danger</font>',
			shape: 'rect',
			x: 100,
			y: 60,
		});

		const svg = render(model);
		svg.querySelectorAll('*').forEach((el) => {
			const fill = el.getAttribute('fill');
			if (fill) expect(fill.includes('var(')).toBe(false);
		});
	});

	it('colours edges with the theme line colour by default', () => {
		const model = emptyModel('LR');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 400, y: 60 });
		model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label: '' });

		const svg = render(model);
		const line = svg.querySelector('.mermaid-flow-edge-line');
		expect(line!.getAttribute('stroke')).toBe('#333333');
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

describe('DiagramCanvas keyboard focus', () => {
	it('is focusable (tabIndex -1) but excluded from Tab order', () => {
		const model = emptyModel('TB');
		const svg = render(model);
		expect(svg.tabIndex).toBe(-1);
	});

	it('focuses the SVG on pointerdown so keyboard shortcuts reach the editor after a click', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60, w: 80, h: 40 });
		const { svg } = setup(model);

		svg.dispatchEvent(pointer('pointerdown', 100, 60));
		expect(document.activeElement).toBe(svg);
	});
});

describe('DiagramCanvas subgraph resize', () => {
	function groupModel(): DiagramModel {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 100, w: 80, h: 40 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 200, y: 100, w: 80, h: 40 });
		model.groups.push({ id: 'g1', title: 'Group', nodeIds: ['A', 'B'] });
		return model;
	}

	it('only shows the resize handle when the group is selected', () => {
		const { canvas, svg } = setup(groupModel());
		expect(svg.querySelector('.mermaid-flow-group .mermaid-flow-resize')).toBeNull();

		canvas.select({ type: 'group', id: 'g1' });
		expect(svg.querySelector('.mermaid-flow-group .mermaid-flow-resize')).not.toBeNull();
	});

	it('scales member node positions proportionally when dragging the handle', () => {
		const model = groupModel();
		const { canvas, svg } = setup(model);
		canvas.select({ type: 'group', id: 'g1' });

		const handle = svg.querySelector<SVGRectElement>('.mermaid-flow-group .mermaid-flow-resize')!;
		expect(handle).not.toBeNull();
		const hx = Number(handle.getAttribute('x'));
		const hy = Number(handle.getAttribute('y'));

		handle.dispatchEvent(pointer('pointerdown', hx, hy));
		// Drag the corner outward — the group's bbox should roughly double.
		svg.dispatchEvent(pointer('pointermove', hx + (hx), hy + (hy)));
		svg.dispatchEvent(pointer('pointerup', hx + (hx), hy + (hy)));

		const a = model.nodes.find((n) => n.id === 'A')!;
		const b = model.nodes.find((n) => n.id === 'B')!;
		// Both members moved away from their original spot, scaled from the
		// group's top-left, and their relative order/spread is preserved.
		expect(a.x).not.toBeCloseTo(100, 0);
		expect(b.x).toBeGreaterThan(a.x);
	});
});

describe('DiagramCanvas edge reconnection', () => {
	// x/y kept well clear of the canvas PADDING margin so resizeCanvas() leaves
	// the viewBox origin at (0,0) — otherwise toSvgPoint()'s client->SVG
	// mapping would carry a constant offset that breaks absolute nodeAt() hits.
	function reconnectModel(): DiagramModel {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 200, y: 140, w: 80, h: 40 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 400, y: 140, w: 80, h: 40 });
		model.nodes.push({ id: 'C', label: 'C', shape: 'rect', x: 600, y: 140, w: 80, h: 40 });
		model.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
		return model;
	}

	it('only shows endpoint handles when the edge is selected', () => {
		const { canvas, svg } = setup(reconnectModel());
		expect(svg.querySelector('.mermaid-flow-edge-handle')).toBeNull();

		canvas.select({ type: 'edge', id: 'e1' });
		expect(svg.querySelectorAll('.mermaid-flow-edge-handle')).toHaveLength(2);
	});

	it('retargets the "to" endpoint to whichever node the handle is dropped on', () => {
		const model = reconnectModel();
		const { canvas, svg } = setup(model);
		canvas.select({ type: 'edge', id: 'e1' });

		const handles = svg.querySelectorAll<SVGCircleElement>('.mermaid-flow-edge-handle');
		// geo.start/end order is [from, to] (see renderEdges); the "to" handle is second.
		const toHandle = handles[1]!;
		const hx = Number(toHandle.getAttribute('cx'));
		const hy = Number(toHandle.getAttribute('cy'));

		toHandle.dispatchEvent(pointer('pointerdown', hx, hy));
		svg.dispatchEvent(pointer('pointermove', 600, 140)); // over node C's centre
		svg.dispatchEvent(pointer('pointerup', 600, 140));

		const edge = model.edges.find((e) => e.id === 'e1')!;
		expect(edge.from).toBe('A');
		expect(edge.to).toBe('C');
	});

	it('leaves the edge unchanged when dropped on empty canvas', () => {
		const model = reconnectModel();
		const { canvas, svg } = setup(model);
		canvas.select({ type: 'edge', id: 'e1' });

		const toHandle = svg.querySelectorAll<SVGCircleElement>('.mermaid-flow-edge-handle')[1]!;
		const hx = Number(toHandle.getAttribute('cx'));
		const hy = Number(toHandle.getAttribute('cy'));

		toHandle.dispatchEvent(pointer('pointerdown', hx, hy));
		svg.dispatchEvent(pointer('pointermove', 2000, 2000)); // empty space
		svg.dispatchEvent(pointer('pointerup', 2000, 2000));

		const edge = model.edges.find((e) => e.id === 'e1')!;
		expect(edge.to).toBe('B');
	});
});

describe('DiagramCanvas link-target highlighting', () => {
	it('marks the hovered node as a link target while drawing a new edge, and clears it after', () => {
		// x/y kept clear of the canvas PADDING margin — see comment in the
		// edge-reconnection describe block above for why this matters for
		// absolute nodeAt() hit-testing via dispatched pointer coordinates.
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 200, y: 140, w: 80, h: 40 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 400, y: 140, w: 80, h: 40 });
		const { svg } = setup(model);

		const anchor = svg.querySelector<SVGCircleElement>('.mermaid-flow-anchor')!;
		const ax = Number(anchor.getAttribute('cx'));
		const ay = Number(anchor.getAttribute('cy'));
		anchor.dispatchEvent(pointer('pointerdown', ax, ay));
		svg.dispatchEvent(pointer('pointermove', 400, 140)); // over node B's centre

		const nodeB = [...svg.querySelectorAll('.mermaid-flow-node')].find((n) =>
			n.querySelector('.mermaid-flow-node-label')?.textContent === 'B',
		)!;
		expect(nodeB.classList.contains('is-link-target')).toBe(true);

		svg.dispatchEvent(pointer('pointerup', 400, 140));
		const nodeBAfter = [...svg.querySelectorAll('.mermaid-flow-node')].find((n) =>
			n.querySelector('.mermaid-flow-node-label')?.textContent === 'B',
		)!;
		expect(nodeBAfter.classList.contains('is-link-target')).toBe(false);
	});
});

describe('DiagramCanvas in-place label editing', () => {
	function nodeGroup(svg: SVGSVGElement, label: string): SVGGElement {
		return [...svg.querySelectorAll('.mermaid-flow-node')].find(
			(n) => n.querySelector('.mermaid-flow-node-label')?.textContent === label,
		) as SVGGElement;
	}

	it('opens a textarea over the node and hides the baked-in label on double-click', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'Hello', shape: 'rect', x: 200, y: 140, w: 100, h: 50 });
		const { svg } = setup(model);

		nodeGroup(svg, 'Hello').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

		const editor = svg.querySelector('.mermaid-flow-label-editor');
		const input = svg.querySelector<HTMLTextAreaElement>('.mermaid-flow-label-input');
		expect(editor).not.toBeNull();
		expect(input).not.toBeNull();
		expect(input!.value).toBe('Hello');
		// The SVG text is hidden while editing so it doesn't show through.
		expect(svg.querySelector('.mermaid-flow-node-label')).toBeNull();
	});

	it('commits the edited label on Enter and restores the rendered text', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'Old', shape: 'rect', x: 200, y: 140, w: 100, h: 50 });
		const { svg } = setup(model);

		nodeGroup(svg, 'Old').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const input = svg.querySelector<HTMLTextAreaElement>('.mermaid-flow-label-input')!;
		input.value = 'New name';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		expect(model.nodes[0]!.label).toBe('New name');
		expect(svg.querySelector('.mermaid-flow-label-editor')).toBeNull();
		expect(svg.querySelector('.mermaid-flow-node-label')!.textContent).toBe('New name');
	});

	it('discards the edit on Escape, leaving the label unchanged', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'Keep', shape: 'rect', x: 200, y: 140, w: 100, h: 50 });
		const { svg } = setup(model);

		nodeGroup(svg, 'Keep').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const input = svg.querySelector<HTMLTextAreaElement>('.mermaid-flow-label-input')!;
		input.value = 'Discarded';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect(model.nodes[0]!.label).toBe('Keep');
		expect(svg.querySelector('.mermaid-flow-label-editor')).toBeNull();
		expect(svg.querySelector('.mermaid-flow-node-label')!.textContent).toBe('Keep');
	});

	it('does not open an editor for a locked node', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'Locked', shape: 'rect', x: 200, y: 140, w: 100, h: 50, locked: true });
		const { svg } = setup(model);

		nodeGroup(svg, 'Locked').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(svg.querySelector('.mermaid-flow-label-editor')).toBeNull();
	});

	it('edits an edge label in place on double-click', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 200, y: 140, w: 80, h: 40 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 400, y: 140, w: 80, h: 40 });
		model.edges.push({ id: 'e1', from: 'A', to: 'B', label: 'old', kind: 'arrow' });
		const { svg } = setup(model);

		const edge = svg.querySelector('.mermaid-flow-edge') as SVGGElement;
		edge.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const input = svg.querySelector<HTMLTextAreaElement>('.mermaid-flow-label-input')!;
		expect(input.value).toBe('old');
		input.value = 'yes';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		expect(model.edges[0]!.label).toBe('yes');
	});
});

describe('DiagramCanvas alignment guides', () => {
	it('shows a guide near alignment but does not snap the dragged node', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60, w: 80, h: 40 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 400, y: 300, w: 80, h: 40 });
		const { canvas, svg } = setup(model);

		const nodeAGroup = [...svg.querySelectorAll('.mermaid-flow-node')].find((n) =>
			n.querySelector('.mermaid-flow-node-label')?.textContent === 'A',
		)!;
		nodeAGroup.dispatchEvent(pointer('pointerdown', 100, 60));
		// Drag A near B's centre X (400) — within the guide threshold, but free.
		svg.dispatchEvent(pointer('pointermove', 403, 200));

		const a = model.nodes.find((n) => n.id === 'A')!;
		expect(a.x).toBe(403); // free position — not snapped to 400
		expect(a.y).toBe(200);
		expect(svg.querySelector('.mermaid-flow-guide')).not.toBeNull();

		svg.dispatchEvent(pointer('pointerup', 403, 200));
		expect(canvas.getSVG().querySelector('.mermaid-flow-guide')).toBeNull();
	});
});

describe('DiagramCanvas drag state notifications', () => {
	it('fires onDragStateChange(true) on drag move and onDragStateChange(false) on pointerup', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 60, w: 80, h: 40 });
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const dragEvents: boolean[] = [];
		const canvas = new DiagramCanvas(parent, model, {
			onSelect() {},
			onChange() {},
			onDragStateChange(isDragging) {
				dragEvents.push(isDragging);
			},
		});
		const svg = canvas.getSVG();
		const nodeA = [...svg.querySelectorAll('.mermaid-flow-node')].find((n) =>
			n.querySelector('.mermaid-flow-node-label')?.textContent === 'A',
		)!;

		// Pointerdown on node without movement does not mark as dragging
		nodeA.dispatchEvent(pointer('pointerdown', 100, 60));
		expect(dragEvents).toEqual([]);

		// Moving mouse starts drag
		svg.dispatchEvent(pointer('pointermove', 120, 80));
		expect(dragEvents).toEqual([true]);

		// Subsequent moves while dragging do not repeat
		svg.dispatchEvent(pointer('pointermove', 130, 90));
		expect(dragEvents).toEqual([true]);

		// Pointerup ends drag
		svg.dispatchEvent(pointer('pointerup', 130, 90));
		expect(dragEvents).toEqual([true, false]);
	});
});
