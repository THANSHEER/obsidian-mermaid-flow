import { describe, it, expect } from 'vitest';
import {
	emptyModel,
	starterModel,
	nextNodeId,
	newGroupId,
	findNode,
	removeNode,
	removeEdge,
	removeGroup,
	duplicateNode,
	groupOf,
	assignNodeToGroup,
	resolveNodeStyle,
} from '../src/model';
import type { DiagramModel } from '../src/model';

function modelWith(ids: string[]): DiagramModel {
	const m = emptyModel('LR');
	for (const id of ids) m.nodes.push({ id, label: id, shape: 'rect', x: 0, y: 0 });
	return m;
}

describe('nextNodeId', () => {
	it('starts at A for an empty model', () => {
		expect(nextNodeId(emptyModel())).toBe('A');
	});
	it('skips ids already in use', () => {
		expect(nextNodeId(modelWith(['A', 'B', 'C']))).toBe('D');
	});
	it('falls back to N# once A–Z are exhausted', () => {
		const ids = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
		expect(nextNodeId(modelWith(ids))).toBe('N1');
	});
});

describe('findNode', () => {
	it('returns the node or undefined', () => {
		const m = modelWith(['A']);
		expect(findNode(m, 'A')?.label).toBe('A');
		expect(findNode(m, 'Z')).toBeUndefined();
	});
});

describe('removeNode', () => {
	it('removes the node, its connected edges and its group membership', () => {
		const m = modelWith(['A', 'B']);
		m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
		m.groups.push({ id: 'g1', title: 'G', nodeIds: ['A', 'B'] });
		removeNode(m, 'A');
		expect(findNode(m, 'A')).toBeUndefined();
		expect(m.edges).toHaveLength(0);
		expect(m.groups[0]?.nodeIds).toEqual(['B']);
	});
});

describe('removeEdge', () => {
	it('removes only the targeted edge', () => {
		const m = modelWith(['A', 'B']);
		m.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });
		m.edges.push({ id: 'e2', from: 'B', to: 'A', label: '', kind: 'arrow' });
		removeEdge(m, 'e1');
		expect(m.edges.map((e) => e.id)).toEqual(['e2']);
	});
});

describe('duplicateNode', () => {
	it('creates a new node with a fresh id, copied content and offset position', () => {
		const m = emptyModel('LR');
		m.nodes.push({ id: 'A', label: 'Hi', shape: 'diamond', x: 100, y: 100, style: { fillColor: '#abc' } });
		const newId = duplicateNode(m, 'A');
		expect(newId).toBeTruthy();
		expect(newId).not.toBe('A');
		const dup = findNode(m, newId!)!;
		expect(dup.label).toBe('Hi');
		expect(dup.shape).toBe('diamond');
		expect(dup.x).toBe(140);
		expect(dup.y).toBe(140);
		// style is deep-copied, not shared with the source
		dup.style!.fillColor = '#000';
		expect(findNode(m, 'A')!.style!.fillColor).toBe('#abc');
	});
	it('returns null for a missing node', () => {
		expect(duplicateNode(emptyModel(), 'nope')).toBeNull();
	});
});

describe('groups', () => {
	it('newGroupId produces unique sub# ids', () => {
		const m = emptyModel();
		const a = newGroupId(m);
		m.groups.push({ id: a, title: a, nodeIds: [] });
		const b = newGroupId(m);
		expect(a).not.toBe(b);
		expect(a).toMatch(/^sub\d+$/);
	});
	it('assignNodeToGroup moves a node, and null removes it from all groups', () => {
		const m = modelWith(['A']);
		m.groups.push({ id: 'g1', title: 'G', nodeIds: [] });
		assignNodeToGroup(m, 'A', 'g1');
		expect(groupOf(m, 'A')?.id).toBe('g1');
		assignNodeToGroup(m, 'A', null);
		expect(groupOf(m, 'A')).toBeUndefined();
	});
	it('removeGroup deletes the group but keeps its member nodes', () => {
		const m = modelWith(['A']);
		m.groups.push({ id: 'g1', title: 'G', nodeIds: ['A'] });
		removeGroup(m, 'g1');
		expect(m.groups).toHaveLength(0);
		expect(findNode(m, 'A')).toBeTruthy();
	});
});

describe('model factories', () => {
	it('emptyModel is empty with the given direction', () => {
		const m = emptyModel('RL');
		expect(m.direction).toBe('RL');
		expect(m.nodes).toHaveLength(0);
		expect(m.edges).toHaveLength(0);
		expect(m.groups).toHaveLength(0);
		expect(m.extras).toHaveLength(0);
	});
	it('starterModel has a single start node', () => {
		const m = starterModel();
		expect(m.nodes).toHaveLength(1);
		expect(m.nodes[0]?.id).toBe('A');
	});
});

describe('resolveNodeStyle', () => {
	it('merges per property with default < classes (in order) < node.style', () => {
		const m = modelWith(['A']);
		m.classDefs.push({ name: 'default', style: { fillColor: '#ddd', textColor: '#111' } });
		m.classDefs.push({ name: 'one', style: { fillColor: '#aaa', strokeColor: '#a0a' } });
		m.classDefs.push({ name: 'two', style: { fillColor: '#bbb' } });
		const node = m.nodes[0]!;
		node.classes = ['one', 'two'];
		node.style = { strokeColor: '#000' };

		const eff = resolveNodeStyle(m, node);
		expect(eff).toEqual({
			fillColor: '#bbb',   // class "two" (later) beats "one" beats default
			textColor: '#111',   // only default sets it
			strokeColor: '#000', // explicit node.style beats class "one"
		});
	});

	it('returns undefined when nothing applies (theme defaults kept)', () => {
		const m = modelWith(['A']);
		expect(resolveNodeStyle(m, m.nodes[0]!)).toBeUndefined();
	});

	it('ignores unknown class names', () => {
		const m = modelWith(['A']);
		const node = m.nodes[0]!;
		node.classes = ['ghost'];
		expect(resolveNodeStyle(m, node)).toBeUndefined();
	});
});
