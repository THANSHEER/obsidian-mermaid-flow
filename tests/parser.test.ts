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
});
