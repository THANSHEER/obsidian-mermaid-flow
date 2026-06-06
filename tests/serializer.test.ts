import { describe, it, expect } from 'vitest';
import { modelToMermaid, modelToFencedBlock } from '../src/serializer';
import { mermaidToModel } from '../src/parser';
import { emptyModel } from '../src/model';
import type { NodeShape, EdgeKind } from '../src/model';

/** Trimmed, non-empty output lines — handy for line-level assertions. */
function lines(out: string): string[] {
	return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

describe('modelToMermaid', () => {
	describe('round-trip with the parser', () => {
		it('preserves nodes, edges, direction and shapes', () => {
			const src = [
				'flowchart LR',
				'  A[Start]',
				'  B{Decision}',
				'  C(End)',
				'  A --> B',
				'  B -->|yes| C',
			].join('\n');
			const first = mermaidToModel(src).model;
			const second = mermaidToModel(modelToMermaid(first)).model;

			expect(second.direction).toBe('LR');
			expect(second.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C']);
			const shapes = Object.fromEntries(second.nodes.map((n) => [n.id, n.shape]));
			expect(shapes['A']).toBe('rect');
			expect(shapes['B']).toBe('diamond');
			expect(shapes['C']).toBe('round');
			expect(second.edges).toHaveLength(2);
			const labelled = second.edges.find((e) => e.from === 'B' && e.to === 'C');
			expect(labelled?.label).toBe('yes');
		});
	});

	describe('label escaping', () => {
		it('escapes embedded double quotes so a label cannot break out', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'He said "hi"', shape: 'rect', x: 0, y: 0 });
			const out = modelToMermaid(model);
			expect(out).toContain('A["He said &quot;hi&quot;"]');
			// the raw label quotes must not survive verbatim inside the brackets
			expect(out).not.toContain('"hi"]');
		});

		it('collapses newlines so a multi-line label stays on one statement', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'line1\nline2', shape: 'rect', x: 0, y: 0 });
			const decl = lines(modelToMermaid(model)).find((l) => l.startsWith('A['));
			expect(decl).toBe('A["line1 line2"]');
		});
	});

	describe('id sanitization (defense-in-depth)', () => {
		it('reduces a hostile node id to a single safe identifier token', () => {
			const model = emptyModel('LR');
			// An id loaded with Mermaid structure characters must not inject tokens.
			model.nodes.push({ id: 'A"] -->|x| B[(evil', label: 'L', shape: 'rect', x: 0, y: 0 });
			const out = modelToMermaid(model);
			const decl = lines(out).find((l) => l.includes('['));
			// the whole declaration is a clean id + quoted label — nothing injected
			expect(decl).toMatch(/^[A-Za-z0-9_]+\["L"\]$/);
			// no injected edge operator or extra node shape leaked through the id
			expect(out).not.toContain('-->');
			expect(out).not.toContain('[(');
		});

		it('sanitizes ids consistently on both ends of an edge', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'a-1', label: 'A', shape: 'rect', x: 0, y: 0 });
			model.nodes.push({ id: 'b.2', label: 'B', shape: 'rect', x: 0, y: 0 });
			model.edges.push({ id: 'e1', from: 'a-1', to: 'b.2', label: '', kind: 'arrow' });
			const out = modelToMermaid(model);
			expect(out).toContain('a_1[');
			expect(out).toContain('b_2[');
			expect(out).toContain('a_1 --> b_2');
		});
	});

	describe('shapes', () => {
		const cases: Array<[NodeShape, string]> = [
			['rect', 'A["L"]'],
			['round', 'A("L")'],
			['stadium', 'A(["L"])'],
			['diamond', 'A{"L"}'],
			['hexagon', 'A{{"L"}}'],
			['circle', 'A(("L"))'],
		];
		for (const [shape, expected] of cases) {
			it(`emits the ${shape} shape`, () => {
				const model = emptyModel('LR');
				model.nodes.push({ id: 'A', label: 'L', shape, x: 0, y: 0 });
				expect(lines(modelToMermaid(model))).toContain(expected);
			});
		}
	});

	describe('edge kinds', () => {
		const cases: Array<[EdgeKind, string]> = [
			['arrow', 'A --> B'],
			['open', 'A --- B'],
			['dotted', 'A -.-> B'],
			['thick', 'A ==> B'],
			['bidirectional', 'A <--> B'],
			['invisible', 'A ~~~ B'],
		];
		for (const [kind, expected] of cases) {
			it(`emits the ${kind} operator`, () => {
				const model = emptyModel('LR');
				model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
				model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 });
				model.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind });
				expect(lines(modelToMermaid(model))).toContain(expected);
			});
		}
	});

	describe('styles and structure', () => {
		it('emits a node style line', () => {
			const model = emptyModel('LR');
			model.nodes.push({
				id: 'A', label: 'A', shape: 'rect', x: 0, y: 0,
				style: { fillColor: '#fff', strokeColor: '#000' },
			});
			expect(lines(modelToMermaid(model))).toContain('style A fill:#fff,stroke:#000');
		});

		it('emits a linkStyle line for a styled edge', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
			model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 });
			model.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow', style: { strokeColor: '#f00' } });
			expect(lines(modelToMermaid(model))).toContain('linkStyle 0 stroke:#f00');
		});

		it('emits a subgraph with its members nested inside', () => {
			const model = emptyModel('TB');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
			model.groups.push({ id: 'g1', title: 'Group', nodeIds: ['A'] });
			const out = lines(modelToMermaid(model));
			expect(out.some((l) => l.startsWith('subgraph g1'))).toBe(true);
			expect(out).toContain('end');
		});

		it('emits a config init directive', () => {
			const model = emptyModel('LR');
			model.config = { theme: 'dark' };
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
			expect(modelToMermaid(model)).toContain('%%{init:');
		});

		it('emits a position comment when nodes carry coordinates', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 80, y: 60 });
			expect(modelToMermaid(model)).toContain('%% mermaid-flow:pos A=80,60');
		});

		it('round-trips unknown lines untouched via extras', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
			model.extras.push('click A "https://example.com"');
			expect(modelToMermaid(model)).toContain('click A "https://example.com"');
		});
	});

	describe('modelToFencedBlock', () => {
		it('wraps the diagram in a mermaid code fence', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
			const block = modelToFencedBlock(model);
			expect(block.startsWith('```mermaid\n')).toBe(true);
			expect(block.endsWith('\n```')).toBe(true);
		});
	});
});
