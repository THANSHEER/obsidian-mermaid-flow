import { describe, it, expect } from 'vitest';
import { mermaidToModel } from '../src/parser';

describe('mermaidToModel', () => {
	it('parses a simple flowchart with nodes and an edge', () => {
		const { model, warnings } = mermaidToModel('flowchart LR\n  A --> B');
		expect(model.nodes).toHaveLength(2);
		expect(model.edges).toHaveLength(1);
		expect(model.direction).toBe('LR');
		expect(warnings).toHaveLength(0);
	});

	it('normalises TD direction to TB', () => {
		const { model } = mermaidToModel('graph TD\n  A --> B');
		expect(model.direction).toBe('TB');
	});

	it('parses all supported node shapes', () => {
		const input = [
			'flowchart TB',
			'  A[Rect]',
			'  B(Round)',
			'  C{Diamond}',
			'  D((Circle))',
			'  E[/Parallelogram/]',
		].join('\n');
		const { model } = mermaidToModel(input);
		const byId = Object.fromEntries(model.nodes.map(n => [n.id, n]));
		expect(byId['A']?.shape).toBe('rect');
		expect(byId['B']?.shape).toBe('round');
		expect(byId['C']?.shape).toBe('diamond');
		expect(byId['D']?.shape).toBe('circle');
		expect(byId['E']?.shape).toBe('parallelogram');
	});

	it('parses pipe-style edge label', () => {
		const { model } = mermaidToModel('flowchart LR\n  A -->|yes| B');
		expect(model.edges[0]?.label).toBe('yes');
	});

	it('parses inline-style edge label', () => {
		const { model } = mermaidToModel('flowchart LR\n  A -- yes --> B');
		expect(model.edges[0]?.label).toBe('yes');
	});

	it('parses dotted and thick edge kinds', () => {
		const input = 'flowchart LR\n  A -.-> B\n  C ==> D';
		const { model } = mermaidToModel(input);
		expect(model.edges[0]?.kind).toBe('dotted');
		expect(model.edges[1]?.kind).toBe('thick');
	});

	it('parses a subgraph', () => {
		const input = [
			'flowchart TB',
			'  subgraph Group1',
			'    A --> B',
			'  end',
		].join('\n');
		const { model } = mermaidToModel(input);
		expect(model.groups).toHaveLength(1);
		expect(model.groups[0]?.title).toBe('Group1');
		expect(model.groups[0]?.nodeIds).toContain('A');
		expect(model.groups[0]?.nodeIds).toContain('B');
	});

	it('preserves position hints across a round-trip', () => {
		const input = [
			'flowchart LR',
			'%% mermaid-flow:pos A=100,200,120,40',
			'  A --> B',
		].join('\n');
		const { model } = mermaidToModel(input);
		const nodeA = model.nodes.find(n => n.id === 'A');
		expect(nodeA?.x).toBe(100);
		expect(nodeA?.y).toBe(200);
		expect(nodeA?.w).toBe(120);
		expect(nodeA?.h).toBe(40);
	});

	it('warns on empty or contentless input', () => {
		const { warnings } = mermaidToModel('');
		expect(warnings.length).toBeGreaterThan(0);
	});

	it('handles multiple edges chained on one line', () => {
		const { model } = mermaidToModel('flowchart LR\n  A --> B --> C');
		expect(model.edges).toHaveLength(2);
		expect(model.nodes).toHaveLength(3);
	});

	it('keeps unknown lines in extras without crashing', () => {
		const input = 'flowchart LR\n  A --> B\n  click A callback';
		const { model } = mermaidToModel(input);
		expect(model.extras.some(e => e.includes('click'))).toBe(true);
	});

	describe('& multi-node syntax', () => {
		it('fans out A & B --> C into two edges', () => {
			const { model, warnings } = mermaidToModel('flowchart LR\n  A & B --> C');
			expect(warnings).toHaveLength(0);
			expect(model.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C']);
			expect(model.edges.map(e => `${e.from}>${e.to}`).sort())
				.toEqual(['A>C', 'B>C']);
		});

		it('fans in A --> B & C into two edges', () => {
			const { model } = mermaidToModel('flowchart LR\n  A --> B & C');
			expect(model.edges.map(e => `${e.from}>${e.to}`).sort())
				.toEqual(['A>B', 'A>C']);
		});

		it('builds the cartesian product for A & B --> C & D', () => {
			const { model } = mermaidToModel('flowchart LR\n  A & B --> C & D');
			expect(model.edges).toHaveLength(4);
			expect(model.edges.map(e => `${e.from}>${e.to}`).sort())
				.toEqual(['A>C', 'A>D', 'B>C', 'B>D']);
		});

		it('applies a pipe label to every fanned-out edge', () => {
			const { model } = mermaidToModel('flowchart LR\n  A -->|x| B & C');
			expect(model.edges).toHaveLength(2);
			expect(model.edges.every(e => e.label === 'x')).toBe(true);
		});

		it('declares multiple nodes with A & B (no edge)', () => {
			const { model } = mermaidToModel('flowchart LR\n  A & B');
			expect(model.nodes).toHaveLength(2);
			expect(model.edges).toHaveLength(0);
		});

		it('does not split on & inside a bracket label', () => {
			const { model } = mermaidToModel('flowchart LR\n  A[Tom & Jerry] --> B');
			expect(model.nodes).toHaveLength(2);
			expect(model.nodes.find(n => n.id === 'A')?.label).toBe('Tom & Jerry');
		});
	});

	describe('Mermaid v11 @{} node syntax', () => {
		it('parses shape and label', () => {
			const { model, warnings } = mermaidToModel(
				'flowchart TD\n  N@{shape: diam, label: "Yes / No"}',
			);
			expect(warnings).toHaveLength(0);
			const n = model.nodes.find(x => x.id === 'N');
			expect(n?.shape).toBe('diamond');
			expect(n?.label).toBe('Yes / No');
		});

		it('handles a quoted label containing a comma', () => {
			const { model } = mermaidToModel(
				'flowchart TD\n  N@{shape: cyl, label: "a, b"}',
			);
			const n = model.nodes.find(x => x.id === 'N');
			expect(n?.shape).toBe('cylinder');
			expect(n?.label).toBe('a, b');
		});

		it('maps common v11 aliases to the nearest supported shape', () => {
			const input = [
				'flowchart TD',
				'  A@{shape: rounded}',
				'  B@{shape: lean-r}',
				'  C@{shape: dbl-circ}',
				'  D@{shape: odd}',
			].join('\n');
			const { model } = mermaidToModel(input);
			const byId = Object.fromEntries(model.nodes.map(n => [n.id, n]));
			expect(byId['A']?.shape).toBe('round');
			expect(byId['B']?.shape).toBe('parallelogram');
			expect(byId['C']?.shape).toBe('double-circle');
			expect(byId['D']?.shape).toBe('asymmetric');
		});

		it('falls back to rect for unknown shape names', () => {
			const { model } = mermaidToModel('flowchart TD\n  N@{shape: starburst}');
			expect(model.nodes.find(x => x.id === 'N')?.shape).toBe('rect');
		});

		it('works inside an edge statement', () => {
			const { model } = mermaidToModel(
				'flowchart TD\n  A --> N@{shape: hex, label: "Prep"}',
			);
			expect(model.edges).toHaveLength(1);
			const n = model.nodes.find(x => x.id === 'N');
			expect(n?.shape).toBe('hexagon');
			expect(n?.label).toBe('Prep');
		});

		it('sends an unparseable multi-line @{ opener to extras', () => {
			const { model } = mermaidToModel('flowchart TD\n  N@{');
			expect(model.nodes.find(x => x.id === 'N')).toBeUndefined();
			expect(model.extras.some(e => e.includes('N@{'))).toBe(true);
		});
	});

	describe('classDef / class styling', () => {
		it('parses classDef into model.classDefs, not extras', () => {
			const { model, warnings } = mermaidToModel(
				'flowchart TD\n  A --> B\n  classDef important fill:#f96,stroke:#333',
			);
			expect(warnings).toHaveLength(0);
			expect(model.classDefs).toHaveLength(1);
			expect(model.classDefs[0]).toEqual({
				name: 'important',
				style: { fillColor: '#f96', strokeColor: '#333' },
			});
			expect(model.extras.some(e => e.includes('classDef'))).toBe(false);
		});

		it('keeps unknown classDef props in style.extra', () => {
			const { model } = mermaidToModel(
				'flowchart TD\n  classDef x fill:#f96,stroke-width:4px,stroke-dasharray: 5 5',
			);
			expect(model.classDefs[0]?.style.extra).toEqual([
				'stroke-width:4px',
				'stroke-dasharray: 5 5',
			]);
		});

		it('supports multiple names in one classDef', () => {
			const { model } = mermaidToModel('flowchart TD\n  classDef a,b fill:#fff');
			expect(model.classDefs.map(c => c.name)).toEqual(['a', 'b']);
		});

		it('lets a redefinition win while keeping order', () => {
			const { model } = mermaidToModel(
				'flowchart TD\n  classDef a fill:#111\n  classDef b fill:#222\n  classDef a fill:#333',
			);
			expect(model.classDefs.map(c => c.name)).toEqual(['a', 'b']);
			expect(model.classDefs[0]?.style.fillColor).toBe('#333');
		});

		it('parses class assignments onto nodes', () => {
			const { model } = mermaidToModel(
				'flowchart TD\n  A --> B\n  class A,B important',
			);
			expect(model.nodes.find(n => n.id === 'A')?.classes).toEqual(['important']);
			expect(model.nodes.find(n => n.id === 'B')?.classes).toEqual(['important']);
		});

		it('parses the ::: shorthand on every node form', () => {
			const input = [
				'flowchart TD',
				'  A:::hot --> B[Label]:::hot',
				'  C{Choice}:::a:::b',
			].join('\n');
			const { model, warnings } = mermaidToModel(input);
			expect(warnings).toHaveLength(0);
			expect(model.nodes.find(n => n.id === 'A')?.classes).toEqual(['hot']);
			const b = model.nodes.find(n => n.id === 'B');
			expect(b?.label).toBe('Label');
			expect(b?.classes).toEqual(['hot']);
			const c = model.nodes.find(n => n.id === 'C');
			expect(c?.shape).toBe('diamond');
			expect(c?.classes).toEqual(['a', 'b']);
		});

		it('stores classDef default like any other class', () => {
			const { model } = mermaidToModel('flowchart TD\n  classDef default fill:#eee');
			expect(model.classDefs[0]?.name).toBe('default');
		});

		it('sends malformed classDef lines to extras', () => {
			const { model, warnings } = mermaidToModel('flowchart TD\n  classDef onlyname');
			expect(model.classDefs).toHaveLength(0);
			expect(model.extras).toContain('classDef onlyname');
			expect(warnings.length).toBeGreaterThan(0);
		});
	});
});
