/*
 * Unit tests for the user component library helpers.
 */

import { describe, it, expect } from 'vitest';
import {
	componentFromSelection,
	insertComponent,
} from '../src/componentLibrary';
import { emptyModel } from '../src/model';

describe('componentLibrary', () => {
	it('builds a component from a selection and inserts remapped ids', () => {
		const model = emptyModel('TB');
		model.nodes.push(
			{ id: 'A', label: 'A', shape: 'rect', x: 100, y: 100 },
			{ id: 'B', label: 'B', shape: 'rect', x: 200, y: 100 },
			{ id: 'C', label: 'C', shape: 'rect', x: 300, y: 100 },
		);
		model.edges.push({ id: 'e1', from: 'A', to: 'B', label: '', kind: 'arrow' });

		const comp = componentFromSelection(model, ['A', 'B'], 'Pair');
		expect(comp).not.toBeNull();
		expect(comp!.name).toBe('Pair');
		expect(comp!.mermaid).toContain('flowchart');

		const target = emptyModel('TB');
		target.nodes.push({ id: 'A', label: 'Existing', shape: 'rect', x: 0, y: 0 });
		const placed = insertComponent(target, comp!);
		expect(placed).toHaveLength(2);
		expect(placed.every((id) => id !== 'A')).toBe(true);
		expect(target.nodes.length).toBe(3);
		expect(target.edges.length).toBe(1);
	});
});
