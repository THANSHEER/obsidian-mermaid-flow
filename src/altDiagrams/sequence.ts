/*
 * Sequence diagram parse ↔ serialize.
 */

import {
	SequenceArrow,
	SequenceMessage,
	SequenceModel,
	SequenceParticipant,
	emptySequence,
} from "./types";

const ARROW_TO_OP: Record<SequenceArrow, string> = {
	solid: "->>",
	dotted: "-->>",
	"solid-cross": "-x",
	"dotted-cross": "--x",
	open: "->",
};

function opToArrow(op: string): SequenceArrow {
	if (op === "-->>" || op === "--)") return "dotted";
	if (op === "-x") return "solid-cross";
	if (op === "--x") return "dotted-cross";
	if (op === "->" || op === "-->") return "open";
	return "solid";
}

export function parseSequence(text: string): SequenceModel {
	const model = emptySequence();
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	let headerSeen = false;
	const seen = new Set<string>();

	const ensureParticipant = (id: string) => {
		if (seen.has(id)) return;
		seen.add(id);
		model.participants.push({ id });
	};

	for (const raw of lines) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (/^sequenceDiagram\b/i.test(trimmed)) {
			headerSeen = true;
			continue;
		}
		if (!headerSeen && trimmed.startsWith("%%")) {
			model.extras.push(trimmed);
			continue;
		}

		const part = trimmed.match(
			/^participant\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/i,
		);
		if (part && part[1]) {
			const id = part[1];
			const alias = part[2]?.trim();
			if (!seen.has(id)) {
				seen.add(id);
				model.participants.push({ id, alias: alias || undefined });
			} else if (alias) {
				const existing = model.participants.find((p) => p.id === id);
				if (existing) existing.alias = alias;
			}
			continue;
		}

		const actor = trimmed.match(/^actor\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/i);
		if (actor && actor[1]) {
			const id = actor[1];
			if (!seen.has(id)) {
				seen.add(id);
				model.participants.push({ id, alias: actor[2]?.trim() || undefined });
			}
			continue;
		}

		const msg = trimmed.match(
			/^([A-Za-z0-9_]+)\s*(->>|-->>|->|-->|-x|--x|-->>\)|-\))\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/,
		);
		if (msg && msg[1] && msg[2] && msg[3]) {
			ensureParticipant(msg[1]);
			ensureParticipant(msg[3]);
			model.messages.push({
				from: msg[1],
				to: msg[3],
				text: (msg[4] ?? "").trim(),
				arrow: opToArrow(msg[2]),
			});
			continue;
		}

		model.extras.push(trimmed);
	}

	return model;
}

export function serializeSequence(model: SequenceModel): string {
	const lines: string[] = ["sequenceDiagram"];
	for (const p of model.participants) {
		if (p.alias && p.alias !== p.id) {
			lines.push(`    participant ${p.id} as ${p.alias}`);
		} else {
			lines.push(`    participant ${p.id}`);
		}
	}
	for (const m of model.messages) {
		const op = ARROW_TO_OP[m.arrow] ?? "->>";
		lines.push(`    ${m.from}${op}${m.to}: ${m.text}`);
	}
	for (const extra of model.extras) {
		lines.push(`    ${extra}`);
	}
	return lines.join("\n");
}

export function addSequenceParticipant(
	model: SequenceModel,
	id: string,
	alias?: string,
): void {
	if (model.participants.some((p) => p.id === id)) return;
	model.participants.push({ id, alias });
}

export function addSequenceMessage(
	model: SequenceModel,
	msg: SequenceMessage,
): void {
	addSequenceParticipant(model, msg.from);
	addSequenceParticipant(model, msg.to);
	model.messages.push(msg);
}

export type { SequenceParticipant, SequenceMessage, SequenceModel };
