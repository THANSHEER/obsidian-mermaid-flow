// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { collectNodeLinks, wireDiagramLinks } from '../src/linkNav';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('collectNodeLinks', () => {
	it('returns linked nodes parsed from a block', () => {
		const src = [
			'flowchart LR',
			'  A[Start]',
			'  B[Plain]',
			'  click A "[[Plan#Phase 2]]"',
		].join('\n');
		const links = collectNodeLinks(src);
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ id: 'A', label: 'Start', target: '[[Plan#Phase 2]]' });
	});

	it('returns nothing when there are no links', () => {
		expect(collectNodeLinks('flowchart LR\n  A --> B')).toHaveLength(0);
	});
});

describe('wireDiagramLinks', () => {
	function diagram(domId: string, label = 'Start'): HTMLElement {
		const root = document.createElement('div');
		const g = document.createElementNS(SVG_NS, 'g');
		g.setAttribute('class', 'node');
		g.id = domId;
		const span = document.createElement('span');
		span.className = 'nodeLabel';
		span.textContent = label;
		g.appendChild(span);
		root.appendChild(g);
		return root;
	}

	it('wires navigation onto a node matched by its mermaid DOM id', () => {
		const root = diagram('flowchart-A-3');
		const navigate = vi.fn();
		wireDiagramLinks(root, [{ id: 'A', label: 'Start', target: '[[Plan]]' }], navigate);

		const node = root.querySelector('g.node') as Element;
		expect(node.classList.contains('mermaid-flow-linked')).toBe(true);
		node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(navigate).toHaveBeenCalledWith('[[Plan]]');
	});

	it('falls back to matching by visible label when the id is unexpected', () => {
		const root = diagram('weird-id', 'Start');
		const navigate = vi.fn();
		wireDiagramLinks(root, [{ id: 'A', label: 'Start', target: 'https://x.test' }], navigate);
		(root.querySelector('g.node') as Element).dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		expect(navigate).toHaveBeenCalledWith('https://x.test');
	});

	it('does not wire an unlinked node', () => {
		const root = diagram('flowchart-Z-1', 'Other');
		const navigate = vi.fn();
		wireDiagramLinks(root, [{ id: 'A', label: 'Start', target: '[[Plan]]' }], navigate);
		const node = root.querySelector('g.node') as Element;
		expect(node.classList.contains('mermaid-flow-linked')).toBe(false);
		node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(navigate).not.toHaveBeenCalled();
	});

	it('is idempotent — a second call does not double-bind', () => {
		const root = diagram('flowchart-A-1');
		const navigate = vi.fn();
		const links = [{ id: 'A', label: 'Start', target: '[[Plan]]' }];
		wireDiagramLinks(root, links, navigate);
		wireDiagramLinks(root, links, navigate);
		(root.querySelector('g.node') as Element).dispatchEvent(
			new MouseEvent('click', { bubbles: true }),
		);
		expect(navigate).toHaveBeenCalledTimes(1);
	});
});
