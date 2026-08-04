/*
 * Alternate diagram types: sequence, mindmap, and ER.
 * Each has a focused model + parse/serialize round-trip and a lightweight
 * visual editor (participants / tree / entities) hosted by AltDiagramModal.
 */

export type AltDiagramKind = "sequence" | "mindmap" | "er";

export interface SequenceParticipant {
	id: string;
	alias?: string;
}

export type SequenceArrow = "solid" | "dotted" | "solid-cross" | "dotted-cross" | "open";

export interface SequenceMessage {
	from: string;
	to: string;
	text: string;
	arrow: SequenceArrow;
}

export interface SequenceModel {
	kind: "sequence";
	participants: SequenceParticipant[];
	messages: SequenceMessage[];
	extras: string[];
}

export interface MindmapNode {
	id: string;
	label: string;
	children: MindmapNode[];
}

export interface MindmapModel {
	kind: "mindmap";
	root: MindmapNode;
	extras: string[];
}

export interface ErAttribute {
	name: string;
	type: string;
	pk?: boolean;
}

export interface ErEntity {
	id: string;
	attributes: ErAttribute[];
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
		extras: [],
	};
}

export function emptyEr(): ErModel {
	return { kind: "er", entities: [], relations: [], extras: [] };
}
