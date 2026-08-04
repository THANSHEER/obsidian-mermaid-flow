/*
 * Sequence diagram parse ↔ serialize.
 */

import { SequenceMessage, SequenceModel, SequenceParticipant, emptySequence } from "./types";

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
			model.extras.push({ text: trimmed, index: model.messages.length });
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
				model.participants.push({ id, alias: alias || undefined, kind: "participant" });
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
				model.participants.push({ id, alias: actor[2]?.trim() || undefined, kind: "actor" });
			}
			continue;
		}

		const msg = trimmed.match(
			/^([A-Za-z0-9_]+)\s*(->>|-->>|->|-->|-x|--x|--\)|-\))\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/,
		);
		if (msg && msg[1] && msg[2] && msg[3]) {
			ensureParticipant(msg[1]);
			ensureParticipant(msg[3]);
			model.messages.push({
				from: msg[1],
				to: msg[3],
				text: (msg[4] ?? "").trim(),
				arrow: msg[2] as SequenceMessage["arrow"],
			});
			continue;
		}

		model.extras.push({ text: trimmed, index: model.messages.length });
	}

	return model;
}

export function serializeSequence(model: SequenceModel): string {
	const lines: string[] = ["sequenceDiagram"];
	for (const p of model.participants) {
		const decl = p.kind === "actor" ? "actor" : "participant";
		if (p.alias && p.alias !== p.id) {
			lines.push(`    ${decl} ${p.id} as ${p.alias}`);
		} else {
			lines.push(`    ${decl} ${p.id}`);
		}
	}
	const extrasByIndex = new Map<number, string[]>();
	for (const extra of model.extras) {
		const list = extrasByIndex.get(extra.index) ?? [];
		list.push(extra.text);
		extrasByIndex.set(extra.index, list);
	}
	for (const extra of extrasByIndex.get(0) ?? []) {
		lines.push(`    ${extra}`);
	}
	for (let i = 0; i < model.messages.length; i++) {
		const m = model.messages[i];
		if (!m) continue;
		lines.push(`    ${m.from}${m.arrow}${m.to}: ${m.text}`);
		for (const extra of extrasByIndex.get(i + 1) ?? []) {
			lines.push(`    ${extra}`);
		}
	}
	return lines.join("\n");
}

export function addSequenceParticipant(
	model: SequenceModel,
	id: string,
	alias?: string,
): void {
	if (model.participants.some((p) => p.id === id)) return;
	model.participants.push({ id, alias, kind: "participant" });
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
