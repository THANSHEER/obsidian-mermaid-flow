import { describe, it, expect } from 'vitest';
import { parseSequence, serializeSequence } from '../src/altDiagrams/sequence';
import { parseMindmap, serializeMindmap } from '../src/altDiagrams/mindmap';
import { parseEr, serializeEr } from '../src/altDiagrams/er';

describe('alt diagrams', () => {
	it('round-trips a sequence diagram', () => {
		const src = [
			'sequenceDiagram',
			'  participant A as Alice',
			'  participant B',
			'  A->>B: hello',
			'  B-->>A: hi',
		].join('\n');
		const model = parseSequence(src);
		expect(model.participants).toHaveLength(2);
		expect(model.messages).toHaveLength(2);
		const out = serializeSequence(model);
		const again = parseSequence(out);
		expect(again.participants.map((p) => p.id)).toEqual(['A', 'B']);
		expect(again.messages[0]?.text).toBe('hello');
	});

	it('round-trips a mindmap', () => {
		const src = [
			'mindmap',
			'  root((Topics))',
			'    Ideas',
			'      Sketch',
			'    Notes',
		].join('\n');
		const model = parseMindmap(src);
		expect(model.root.label).toBe('Topics');
		expect(model.root.children).toHaveLength(2);
		const out = serializeMindmap(model);
		const again = parseMindmap(out);
		expect(again.root.children[0]?.label).toBe('Ideas');
		expect(again.root.children[0]?.children[0]?.label).toBe('Sketch');
	});

	it('round-trips an ER diagram', () => {
		const src = [
			'erDiagram',
			'  CUSTOMER {',
			'    string name',
			'    int id PK',
			'  }',
			'  ORDER {',
			'    int id PK',
			'  }',
			'  CUSTOMER ||--o{ ORDER : places',
		].join('\n');
		const model = parseEr(src);
		expect(model.entities).toHaveLength(2);
		expect(model.relations).toHaveLength(1);
		const out = serializeEr(model);
		const again = parseEr(out);
		expect(again.entities.find((e) => e.id === 'CUSTOMER')?.attributes.length).toBe(2);
		expect(again.relations[0]?.label).toBe('places');
	});
});
