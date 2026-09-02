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

		it('encodes newlines as <br/> so a multi-line label stays on one statement', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'line1\nline2', shape: 'rect', x: 0, y: 0 });
			const decl = lines(modelToMermaid(model)).find((l) => l.startsWith('A['));
			expect(decl).toBe('A["line1<br/>line2"]');
		});

		it('round-trips multi-line node and edge labels', () => {
			const model = emptyModel('TB');
			model.nodes.push({ id: 'A', label: 'top\nbottom', shape: 'rect', x: 0, y: 0 });
			model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 100 });
			model.edges.push({ id: 'e1', from: 'A', to: 'B', kind: 'arrow', label: 'yes\nplease' });

			const out = modelToMermaid(model);
			// Each statement stays on a single line with <br/> instead of \n.
			expect(lines(out)).toContain('A["top<br/>bottom"]');
			expect(lines(out)).toContain('A -->|"yes<br/>please"| B');

			const back = mermaidToModel(out).model;
			expect(back.nodes.find((n) => n.id === 'A')?.label).toBe('top\nbottom');
			expect(back.edges[0]?.label).toBe('yes\nplease');
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

		it('round-trips nested subgraphs without flattening', () => {
			const src = [
				'flowchart TB',
				'  subgraph Outer [Outer]',
				'    subgraph Inner [Inner]',
				'      A[A] --> B[B]',
				'    end',
				'  end',
			].join('\n');
			const once = mermaidToModel(src).model;
			const text1 = modelToMermaid(once, { includePositions: false });
			const twice = mermaidToModel(text1).model;
			const text2 = modelToMermaid(twice, { includePositions: false });

			expect(once.groups).toHaveLength(2);
			const outer = once.groups.find((g) => g.id === 'Outer');
			const inner = once.groups.find((g) => g.id === 'Inner');
			expect(outer?.parentId).toBeUndefined();
			expect(inner?.parentId).toBe('Outer');
			expect(inner?.nodeIds).toEqual(expect.arrayContaining(['A', 'B']));

			expect(twice.groups.find((g) => g.id === 'Inner')?.parentId).toBe('Outer');
			expect(text1).toMatch(/subgraph Outer[\s\S]*subgraph Inner[\s\S]*end[\s\S]*end/);
			expect(text2).toBe(text1);
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

		it('emits a click line for a node with a link', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, link: '[[Note#Phase 2]]' });
			expect(modelToMermaid(model)).toContain('click A "[[Note#Phase 2]]"');
		});

		it('entity-encodes quotes in a link target so it cannot break out', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, link: 'a"b' });
			const out = modelToMermaid(model);
			expect(out).toContain('click A "a&quot;b"');
			expect(out).not.toContain('"a"b"');
		});

		it('round-trips a node link (no quotes) to identity', () => {
			const src = 'flowchart LR\n  A[Start]\n  click A "[[Plan#Phase 2]]"';
			const first = mermaidToModel(src).model;
			const second = mermaidToModel(modelToMermaid(first)).model;
			expect(second.nodes.find((n) => n.id === 'A')?.link).toBe('[[Plan#Phase 2]]');
		});

		it('round-trips a link alongside extras, classDef and a comment with no loss or dupes', () => {
			const src = [
				'flowchart TB',
				'  A[Start]',
				'  B[Stop]',
				'  A --> B',
				'  classDef hot fill:#f96',
				'  class A hot',
				'  click A "[[Plan#Phase 2]]"',
				'  click B call doThing()',
				'  %% a stray comment',
			].join('\n');
			const out = modelToMermaid(mermaidToModel(src).model);
			// The link is emitted exactly once (not duplicated into extras).
			expect(out.match(/click A "\[\[Plan#Phase 2\]\]"/g)).toHaveLength(1);
			// The unsupported callback click and the comment survive verbatim.
			expect(out).toContain('click B call doThing()');
			expect(out).toContain('%% a stray comment');
			// A second round-trip is stable and preserves link + class + non-link.
			const second = mermaidToModel(out).model;
			expect(second.nodes.find((n) => n.id === 'A')?.link).toBe('[[Plan#Phase 2]]');
			expect(second.nodes.find((n) => n.id === 'A')?.classes).toContain('hot');
			expect(second.nodes.find((n) => n.id === 'B')?.link).toBeUndefined();
		});
	});

	describe('classDef / class emission', () => {
		function classyModel() {
			const model = emptyModel('TB');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, classes: ['hot'] });
			model.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 0, y: 0, classes: ['hot'] });
			model.classDefs.push({ name: 'hot', style: { fillColor: '#f96', strokeColor: '#333' } });
			return model;
		}

		it('emits classDef and grouped class lines', () => {
			const out = lines(modelToMermaid(classyModel()));
			expect(out).toContain('classDef hot fill:#f96,stroke:#333');
			expect(out).toContain('class A,B hot');
		});

		it('emits class lines after style lines and before linkStyle lines', () => {
			const model = classyModel();
			const a = model.nodes[0]!;
			a.style = { textColor: '#000' };
			model.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow', style: { strokeColor: '#f00' } });
			const out = lines(modelToMermaid(model));
			const styleIdx = out.findIndex(l => l.startsWith('style A'));
			const classDefIdx = out.findIndex(l => l.startsWith('classDef hot'));
			const classIdx = out.findIndex(l => l.startsWith('class A,B'));
			const linkIdx = out.findIndex(l => l.startsWith('linkStyle'));
			expect(styleIdx).toBeGreaterThan(-1);
			expect(classDefIdx).toBeGreaterThan(styleIdx);
			expect(classIdx).toBeGreaterThan(classDefIdx);
			expect(linkIdx).toBeGreaterThan(classIdx);
		});

		it('round-trips ::: shorthand as canonical class lines, stable across two trips', () => {
			const src = [
				'flowchart TD',
				'  A:::hot --> B',
				'  classDef hot fill:#f96',
			].join('\n');
			const once = mermaidToModel(src).model;
			const text1 = modelToMermaid(once);
			const twice = mermaidToModel(text1).model;
			const text2 = modelToMermaid(twice);

			expect(twice.nodes.find(n => n.id === 'A')?.classes).toEqual(['hot']);
			expect(twice.classDefs).toEqual(once.classDefs);
			expect(text2).toBe(text1); // canonical form is a fixed point
			expect(text1).toContain('class A hot');
		});

		it('keeps declaration order across round trips', () => {
			const model = emptyModel('TB');
			model.classDefs.push({ name: 'zeta', style: { fillColor: '#111' } });
			model.classDefs.push({ name: 'alpha', style: { fillColor: '#222' } });
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
			const back = mermaidToModel(modelToMermaid(model)).model;
			expect(back.classDefs.map(c => c.name)).toEqual(['zeta', 'alpha']);
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

	describe('Issue #26 round-trips', () => {
		it('round-trips quoted labels containing semicolons without corruption', () => {
			const src = 'flowchart LR\n  A["one; two"] --> B\n  %% mermaid-flow:pos A=0,0 B=100,0';
			const first = mermaidToModel(src).model;
			const out1 = modelToMermaid(first);
			expect(out1).toContain('A["one; two"]');
			const second = mermaidToModel(out1).model;
			expect(second.nodes).toHaveLength(2);
			expect(second.nodes.find((n) => n.id === 'A')?.label).toBe('one; two');
		});

		it('round-trips labels containing double quotes over multiple cycles without minting ghost nodes', () => {
			const model = emptyModel('LR');
			model.nodes.push({ id: 'A', label: 'He said "hi"', shape: 'rect', x: 0, y: 0 });
			model.nodes.push({ id: 'B', label: 'End', shape: 'rect', x: 100, y: 0 });
			model.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });

			// Cycle 1: serialize -> parse
			const text1 = modelToMermaid(model);
			expect(text1).toContain('A["He said &quot;hi&quot;"]');
			const parsed1 = mermaidToModel(text1).model;
			expect(parsed1.nodes.map(n => n.id).sort()).toEqual(['A', 'B']);
			expect(parsed1.nodes.find(n => n.id === 'A')?.label).toBe('He said "hi"');

			// Cycle 2: serialize -> parse (verify stability and no ghost nodes)
			const text2 = modelToMermaid(parsed1);
			expect(text2).not.toContain('hi["hi"]');
			expect(text2).not.toContain('quot["quot"]');
			const parsed2 = mermaidToModel(text2).model;
			expect(parsed2.nodes.map(n => n.id).sort()).toEqual(['A', 'B']);
			expect(parsed2.nodes.find(n => n.id === 'A')?.label).toBe('He said "hi"');
		});

		it('preserves subgraphs with semicolon labels across round-trip', () => {
			const src = [
				'flowchart TB',
				'  subgraph Group1',
				'    A["one; two"] --> B',
				'  end',
			].join('\n');
			const first = mermaidToModel(src).model;
			const out = modelToMermaid(first, { includePositions: false });
			const second = mermaidToModel(out).model;
			expect(second.groups).toHaveLength(1);
			expect(second.groups[0]?.id).toBe('Group1');
			expect(second.groups[0]?.nodeIds).toEqual(expect.arrayContaining(['A', 'B']));
		});
	});

	describe('Issue #27 round-trips', () => {
		it('preserves style <subgraphId> without creating a ghost node or pos entry', () => {
			const src = [
				'flowchart TB',
				'  subgraph Group1',
				'    A --> B',
				'  end',
				'  style Group1 fill:none,stroke:#333',
			].join('\n');
			const first = mermaidToModel(src).model;
			expect(first.nodes.map(n => n.id).sort()).toEqual(['A', 'B']);
			const out = modelToMermaid(first);
			expect(out).toContain('style Group1 fill:none,stroke:#333');
			expect(out).not.toContain('Group1["Group1"]');
			expect(out).not.toContain('Group1=');

			const second = mermaidToModel(out).model;
			expect(second.nodes.map(n => n.id).sort()).toEqual(['A', 'B']);
			expect(second.groups.find(g => g.id === 'Group1')?.style?.fillColor).toBe('none');
		});

		it('preserves direction inside a subgraph without moving it to root level', () => {
			const src = [
				'flowchart TB',
				'  subgraph Group1',
				'    direction LR',
				'    A --> B',
				'  end',
			].join('\n');
			const first = mermaidToModel(src).model;
			expect(first.direction).toBe('TB');
			expect(first.groups.find(g => g.id === 'Group1')?.direction).toBe('LR');

			const out = modelToMermaid(first, { includePositions: false });
			// Direction statement must be inside the subgraph block before 'end'
			expect(out).toMatch(/subgraph Group1[\s\S]*direction LR[\s\S]*end/);
			expect(out).not.toMatch(/end[\s\S]*direction LR/);

			const second = mermaidToModel(out).model;
			expect(second.direction).toBe('TB');
			expect(second.groups.find(g => g.id === 'Group1')?.direction).toBe('LR');
		});

		it('preserves class assignment on subgraphs across round-trips', () => {
			const src = [
				'flowchart TB',
				'  subgraph Group1',
				'    A --> B',
				'  end',
				'  classDef custom fill:#afa',
				'  class Group1 custom',
			].join('\n');
			const first = mermaidToModel(src).model;
			expect(first.nodes.find(n => n.id === 'Group1')).toBeUndefined();
			const out = modelToMermaid(first, { includePositions: false });
			expect(out).toContain('class Group1 custom');
			expect(out).not.toContain('Group1["Group1"]');
			const second = mermaidToModel(out).model;
			expect(second.groups.find(g => g.id === 'Group1')?.classes).toContain('custom');
		});

		it('keeps subgraph-scoped comments inside the subgraph across round-trips', () => {
			const src = [
				'flowchart TB',
				'  subgraph Group1',
				'    %% internal group comment',
				'    A --> B',
				'  end',
			].join('\n');
			const first = mermaidToModel(src).model;
			const out = modelToMermaid(first, { includePositions: false });
			expect(out).toMatch(/subgraph Group1[\s\S]*%% internal group comment[\s\S]*end/);
			const second = mermaidToModel(out).model;
			expect(second.groups.find(g => g.id === 'Group1')?.extras)
				.toContain('%% internal group comment');
			expect(second.extras).toHaveLength(0);
		});

		it('does not emit style or class for emptied/skipped subgraphs, preventing ghost nodes', () => {
			const model = emptyModel('TB');
			model.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 });
			// Group has no nodes
			model.groups.push({
				id: 'EmptyGroup',
				title: 'Empty',
				nodeIds: [],
				style: { fillColor: '#f00' },
				classes: ['custom'],
			});
			const out = modelToMermaid(model, { includePositions: false });
			expect(out).not.toContain('style EmptyGroup');
			expect(out).not.toContain('class EmptyGroup');
			const back = mermaidToModel(out).model;
			expect(back.nodes.find(n => n.id === 'EmptyGroup')).toBeUndefined();
		});
	});

	describe('Issue #29: YAML frontmatter', () => {
		const input = [
			'---',
			'title: My diagram',
			'config:',
			'  theme: dark',
			'---',
			'flowchart TD',
			'  A[Start] --> B[End]',
		].join('\n');

		it('re-emits frontmatter at the top of the block, indentation intact', () => {
			const out = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			expect(out.startsWith('---\ntitle: My diagram\nconfig:\n  theme: dark\n---\n')).toBe(true);
			expect(out.split('\n')[5]).toBe('flowchart TB');
		});

		it('keeps the frontmatter above the position comment on a full save', () => {
			const model = mermaidToModel(input).model;
			const out = modelToMermaid(model, { includePositions: true });
			expect(out.indexOf('---')).toBeLessThan(out.indexOf('flowchart'));
			expect(out).toContain('%% mermaid-flow:pos');
		});

		it('is stable across a second round trip', () => {
			const once = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			const twice = modelToMermaid(mermaidToModel(once).model, {
				includePositions: false,
			});
			expect(twice).toBe(once);
		});

		it('emits nothing extra when there is no frontmatter', () => {
			const out = modelToMermaid(mermaidToModel('flowchart TD\n  A --> B').model, {
				includePositions: false,
			});
			expect(out.startsWith('flowchart TB')).toBe(true);
		});
	});

	describe('Issue #30: edges targeting a subgraph', () => {
		it('round-trips an edge into a subgraph without emitting a ghost node', () => {
			const input = [
				'flowchart TB',
				'  subgraph Group1[Grp]',
				'    A',
				'  end',
				'  B --> Group1',
			].join('\n');
			const out = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			expect(lines(out)).toContain('B --> Group1');
			expect(out).not.toContain('Group1["Group1"]');
			expect(out).not.toContain('Group1[Group1]');
		});

		it('is stable across a second round trip', () => {
			const input = [
				'flowchart TB',
				'  subgraph Group1[Grp]',
				'    A',
				'  end',
				'  B --> Group1',
			].join('\n');
			const once = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			const twice = modelToMermaid(mermaidToModel(once).model, {
				includePositions: false,
			});
			expect(twice).toBe(once);
		});
	});

	describe('Issue #31 & #32: preserving unknown style/class and out-of-range linkStyle', () => {
		it('round-trips unknown style and class directives in extras without creating nodes', () => {
			const input = [
				'flowchart TD',
				'  A --> B',
				'  style UnknownNode fill:#f00',
				'  class UnknownTarget myClass',
			].join('\n');
			const out = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			expect(out).toContain('style UnknownNode fill:#f00');
			expect(out).toContain('class UnknownTarget myClass');
			expect(out).not.toContain('UnknownNode[');
			expect(out).not.toContain('UnknownTarget[');
		});

		it('round-trips out-of-range linkStyle directive in extras without dropping it', () => {
			const input = [
				'flowchart TD',
				'  A --> B',
				'  linkStyle 5 stroke:#f00',
			].join('\n');
			const out = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			expect(out).toContain('linkStyle 5 stroke:#f00');
		});
	});

	describe('Issue #33: preserving comments, accTitle, and accDescr', () => {
		it('emits accTitle and accDescr directly below flowchart header', () => {
			const input = [
				'flowchart TD',
				'  accTitle: My Title',
				'  accDescr: My Description',
				'  A --> B',
			].join('\n');
			const out = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			const l = lines(out);
			expect(l[0]).toBe('flowchart TB');
			expect(l[1]).toBe('accTitle: My Title');
			expect(l[2]).toBe('accDescr: My Description');
		});

		it('preserves section comment locations in reproduction from Issue #33', () => {
			const input = [
				'flowchart TD',
				'  %% first section',
				'  A --> B',
				'  %% second section',
				'  B --> C',
			].join('\n');
			const out = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			expect(out.indexOf('%% first section')).toBeLessThan(out.indexOf('A --> B'));
			expect(out.indexOf('A --> B')).toBeLessThan(out.indexOf('%% second section'));
			expect(out.indexOf('%% second section')).toBeLessThan(out.indexOf('B --> C'));
		});

		it('is stable across a second round trip for comments and accessibility tags', () => {
			const input = [
				'flowchart TD',
				'  accTitle: Overview',
				'  accDescr: System map',
				'  %% first section',
				'  A --> B',
				'  %% second section',
				'  B --> C',
			].join('\n');
			const once = modelToMermaid(mermaidToModel(input).model, {
				includePositions: false,
			});
			const twice = modelToMermaid(mermaidToModel(once).model, {
				includePositions: false,
			});
			expect(twice).toBe(once);
		});
	});
});
