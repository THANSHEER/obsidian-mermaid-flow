import { describe, it, expect } from 'vitest';
import {
	emptyModel,
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
	canBeParentOf,
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

describe('canBeParentOf', () => {
	it('allows null as parent (root subgraph)', () => {
		const m = emptyModel('LR');
		m.groups.push({ id: 'g1', title: 'G1', nodeIds: [] });
		expect(canBeParentOf(m, null, 'g1')).toBe(true);
	});

	it('prevents self-reference', () => {
		const m = emptyModel('LR');
		m.groups.push({ id: 'g1', title: 'G1', nodeIds: [] });
		expect(canBeParentOf(m, 'g1', 'g1')).toBe(false);
	});

	it('prevents direct child from becoming parent (cycle)', () => {
		const m = emptyModel('LR');
		m.groups.push({ id: 'parent', title: 'Parent', nodeIds: [] });
		m.groups.push({ id: 'child', title: 'Child', nodeIds: [], parentId: 'parent' });
		// Child cannot be parent of its own parent
		expect(canBeParentOf(m, 'child', 'parent')).toBe(false);
	});

	it('prevents nested descendant from becoming parent (deep cycle)', () => {
		const m = emptyModel('LR');
		m.groups.push({ id: 'root', title: 'Root', nodeIds: [] });
		m.groups.push({ id: 'level1', title: 'Level1', nodeIds: [], parentId: 'root' });
		m.groups.push({ id: 'level2', title: 'Level2', nodeIds: [], parentId: 'level1' });
		// level2 cannot be parent of root (would create cycle)
		expect(canBeParentOf(m, 'level2', 'root')).toBe(false);
		// level2 cannot be parent of level1 (would create cycle)
		expect(canBeParentOf(m, 'level2', 'level1')).toBe(false);
	});

	it('allows sibling as parent', () => {
		const m = emptyModel('LR');
		m.groups.push({ id: 'g1', title: 'G1', nodeIds: [] });
		m.groups.push({ id: 'g2', title: 'G2', nodeIds: [] });
		expect(canBeParentOf(m, 'g1', 'g2')).toBe(true);
		expect(canBeParentOf(m, 'g2', 'g1')).toBe(true);
	});

	it('allows ancestor as parent (re-parenting)', () => {
		const m = emptyModel('LR');
		m.groups.push({ id: 'grandparent', title: 'GP', nodeIds: [] });
		m.groups.push({ id: 'parent', title: 'P', nodeIds: [], parentId: 'grandparent' });
		m.groups.push({ id: 'child', title: 'C', nodeIds: [], parentId: 'parent' });
		// Child can be moved directly under grandparent
		expect(canBeParentOf(m, 'grandparent', 'child')).toBe(true);
	});

	it('duplicateNode inherits group membership when source node belongs to a group', () => {
		const m = emptyModel('TB');
		m.nodes.push({ id: 'A', label: 'Node A', shape: 'rect', x: 50, y: 50 });
		m.groups.push({ id: 'g1', title: 'Group 1', nodeIds: ['A'] });
		const dupId = duplicateNode(m, 'A');
		expect(dupId).toBeTruthy();
		expect(m.groups[0]?.nodeIds).toContain('A');
		expect(m.groups[0]?.nodeIds).toContain(dupId);
	});
});

describe('classDef management and deletion', () => {
	it('scrubs class names from nodes and groups when a classDef is deleted', () => {
		const m = emptyModel('LR');
		m.classDefs.push({ name: 'warn', style: { fillColor: '#f99' } });
		m.classDefs.push({ name: 'highlight', style: { fillColor: '#ff9' } });
		m.nodes.push({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0, classes: ['warn', 'highlight'] });
		m.nodes.push({ id: 'B', label: 'B', shape: 'rect', x: 100, y: 0, classes: ['warn'] });
		m.groups.push({ id: 'g1', title: 'G1', nodeIds: ['A'], classes: ['warn'] });

		// Simulate deleting the 'warn' class
		const target = 'warn';
		m.classDefs = m.classDefs.filter((c) => c.name !== target);
		for (const n of m.nodes) {
			if (n.classes?.includes(target)) {
				n.classes = n.classes.filter((c) => c !== target);
				if (n.classes.length === 0) delete n.classes;
			}
		}
		for (const g of m.groups) {
			if (g.classes?.includes(target)) {
				g.classes = g.classes.filter((c) => c !== target);
				if (g.classes.length === 0) delete g.classes;
			}
		}

		expect(m.classDefs.map((c) => c.name)).toEqual(['highlight']);
		expect(m.nodes[0]!.classes).toEqual(['highlight']);
		expect(m.nodes[1]!.classes).toBeUndefined();
		expect(m.groups[0]!.classes).toBeUndefined();
	});
});

describe('EDGE_PRESETS', () => {
	it('defines valid semantic presets with kind and style', async () => {
		const { EDGE_PRESETS } = await import('../src/presets');
		expect(EDGE_PRESETS.length).toBeGreaterThanOrEqual(4);
		for (const preset of EDGE_PRESETS) {
			expect(preset.id).toBeTruthy();
			expect(preset.label).toBeTruthy();
			expect(['arrow', 'open', 'dotted', 'thick']).toContain(preset.kind);
			expect(typeof preset.style).toBe('object');
		}
	});
});

