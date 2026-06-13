// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveOverlaps, autoLayout } from '../src/layout';
import { emptyModel } from '../src/model';
import { estimateNodeSize } from '../src/nodeGeometry';
import type { DiagramModel } from '../src/model';

// Obsidian globals are polyfilled in tests/setup.ts.

function anyOverlap(model: DiagramModel, margin = 0): boolean {
	const boxes = model.nodes.map((n) => {
		const s = estimateNodeSize(n);
		return { x: n.x, y: n.y, hw: s.w / 2, hh: s.h / 2 };
	});
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			const A = boxes[i]!, B = boxes[j]!;
			const ox = A.hw + B.hw + margin - Math.abs(A.x - B.x);
			const oy = A.hh + B.hh + margin - Math.abs(A.y - B.y);
			if (ox > 0 && oy > 0) return true;
		}
	}
	return false;
}

describe('resolveOverlaps', () => {
	it('separates boxes stacked at the same point', () => {
		const model = emptyModel('TB');
		// Three nodes placed almost on top of each other (stale tight positions).
		model.nodes.push({ id: 'A', label: 'Auth Service', shape: 'rect', x: 200, y: 200 });
		model.nodes.push({ id: 'B', label: 'Order Service', shape: 'rect', x: 205, y: 200 });
		model.nodes.push({ id: 'C', label: 'Product Service', shape: 'rect', x: 210, y: 200 });

		expect(anyOverlap(model)).toBe(true);
		resolveOverlaps(model);
		expect(anyOverlap(model)).toBe(false);
	});

	it('leaves a well-spaced layout untouched (idempotent)', () => {
		const model = emptyModel('LR');
		model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 100, y: 100 });
		model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 400, y: 100 });
		const before = model.nodes.map((n) => ({ x: n.x, y: n.y }));

		resolveOverlaps(model);
		expect(model.nodes.map((n) => ({ x: n.x, y: n.y }))).toEqual(before);
	});

	it('keeps nodes in positive space', () => {
		const model = emptyModel('TB');
		model.nodes.push({ id: 'A', label: 'Long label one', shape: 'rect', x: 5, y: 5 });
		model.nodes.push({ id: 'B', label: 'Long label two', shape: 'rect', x: 8, y: 8 });

		resolveOverlaps(model);
		for (const n of model.nodes) {
			expect(n.x).toBeGreaterThanOrEqual(0);
			expect(n.y).toBeGreaterThanOrEqual(0);
		}
	});

	it('auto-layout never overlaps a multi-node rank', () => {
		const model = emptyModel('TB');
		for (const id of ['A', 'B', 'C', 'D']) {
			model.nodes.push({ id, label: `${id} Service`, shape: 'rect', x: 0, y: 0 });
		}
		model.nodes.push({ id: 'R', label: 'Root', shape: 'rect', x: 0, y: 0 });
		for (const id of ['A', 'B', 'C', 'D']) {
			model.edges.push({ id: `e${id}`, from: 'R', to: id, kind: 'arrow', label: '' });
		}
		autoLayout(model);
		expect(anyOverlap(model)).toBe(false);
	});
});
