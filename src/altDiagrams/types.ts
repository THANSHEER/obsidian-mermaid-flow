/*
 * Alternate diagram types: sequence, mindmap, and ER.
 * Each has a focused model + parse/serialize round-trip and a lightweight
 * visual editor (participants / tree / entities) hosted by AltDiagramModal.
 */

export type AltDiagramKind = "sequence" | "mindmap" | "er";

export interface SequenceParticipant {
	id: string;
	alias?: string;
	kind?: "participant" | "actor";
}

export type SequenceArrow =
	| "->>"
	| "-->>"
	| "-x"
	| "--x"
	| "->"
	| "-->"
	| "-)"
	| "--)";

export interface SequenceMessage {
	from: string;
	to: string;
	text: string;
	arrow: SequenceArrow;
}

export interface SequenceRawLine {
	text: string;
	index: number;
}

export interface SequenceModel {
	kind: "sequence";
	participants: SequenceParticipant[];
	messages: SequenceMessage[];
	extras: SequenceRawLine[];
}

export interface MindmapNode {
	id: string;
	label: string;
	children: MindmapNode[];
}

export interface MindmapModel {
	kind: "mindmap";
	root: MindmapNode;
	extrasBeforeRoot: string[];
	extrasAfterRoot: string[];
}

export interface ErAttribute {
	name: string;
	type: string;
	pk?: boolean;
	fk?: boolean;
	uk?: boolean;
	comment?: string;
}

export interface ErEntity {
	id: string;
	attributes: ErAttribute[];
	extras: string[];
}

export interface ErRelation {
	from: string;
	to: string;
	/** Mermaid cardinality token, e.g. `||--o{` */
	card: string;
	label: string;
}

export interface ErModel {
	kind: "er";
	entities: ErEntity[];
	relations: ErRelation[];
	extras: string[];
}

export type AltDiagramModel = SequenceModel | MindmapModel | ErModel;

export function emptySequence(): SequenceModel {
	return { kind: "sequence", participants: [], messages: [], extras: [] };
}

export function emptyMindmap(): MindmapModel {
	return {
		kind: "mindmap",
		root: { id: "root", label: "Root", children: [] },
		extrasBeforeRoot: [],
		extrasAfterRoot: [],
	};
}

export function emptyEr(): ErModel {
	return { kind: "er", entities: [], relations: [], extras: [] };
}
