/*
 * Entity-relationship diagram parse ↔ serialize.
 */

import { ErAttribute, ErEntity, ErModel, ErRelation, emptyEr } from "./types";

const REL_RE =
	/^([A-Za-z0-9_]+)\s+(\|\|--o\{|\|\|--\|\||\}\|--\|\||\|\|--o\||\}o--o\{|\}\|..\|\||\|\|--\|\{|\}\|..\|\{)\s+([A-Za-z0-9_]+)\s*(?::\s*(.*))?$/;

export function parseEr(text: string): ErModel {
	const model = emptyEr();
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	let headerSeen = false;
	let current: ErEntity | null = null;

	const ensureEntity = (id: string): ErEntity => {
		let e = model.entities.find((x) => x.id === id);
		if (!e) {
			e = { id, attributes: [], extras: [] };
			model.entities.push(e);
		}
		return e;
	};

	for (const raw of lines) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (/^erDiagram\b/i.test(trimmed)) {
			headerSeen = true;
			continue;
		}
		if (!headerSeen && trimmed.startsWith("%%")) {
			model.extras.push(trimmed);
			continue;
		}

		if (current && trimmed === "}") {
			current = null;
			continue;
		}

		if (current) {
			const inlineComment = trimmed.match(/^(.*?)(?:\s+%%\s*(.*))?$/);
			const attrText = inlineComment?.[1]?.trim() ?? trimmed;
			const attr = attrText.match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)(?:\s+(.+))?$/i);
			if (attr && attr[1] && attr[2]) {
				const meta = (attr[3] ?? "").trim();
				const quoted = meta.match(/^(.*?)(?:\s+"(.*)")?$/);
				const flags = new Set(
					(quoted?.[1] ?? "")
						.split(",")
						.map((part) => part.trim().toUpperCase())
						.filter(Boolean),
				);
				const a: ErAttribute = {
					type: attr[1],
					name: attr[2],
					pk: flags.has("PK"),
					fk: flags.has("FK"),
					uk: flags.has("UK"),
					comment: inlineComment?.[2]?.trim() || quoted?.[2]?.trim() || undefined,
				};
				current.attributes.push(a);
				continue;
			}
			current.extras.push(trimmed);
			continue;
		}

		const ent = trimmed.match(/^([A-Za-z0-9_]+)\s*\{$/);
		if (ent && ent[1]) {
			current = ensureEntity(ent[1]);
			continue;
		}

		const rel = trimmed.match(REL_RE);
		if (rel && rel[1] && rel[2] && rel[3]) {
			ensureEntity(rel[1]);
			ensureEntity(rel[3]);
			const relation: ErRelation = {
				from: rel[1],
				to: rel[3],
				card: rel[2],
				label: (rel[4] ?? "").trim(),
			};
			model.relations.push(relation);
			continue;
		}

		// Bare entity name
		const bare = trimmed.match(/^([A-Za-z0-9_]+)$/);
		if (bare && bare[1]) {
			ensureEntity(bare[1]);
			continue;
		}

		model.extras.push(trimmed);
	}

	return model;
}

export function serializeEr(model: ErModel): string {
	const lines: string[] = ["erDiagram"];
	for (const e of model.entities) {
		if (e.attributes.length === 0) {
			lines.push(`    ${e.id}`);
			continue;
		}
		lines.push(`    ${e.id} {`);
		for (const a of e.attributes) {
			const flags = [
				a.pk ? "PK" : null,
				a.fk ? "FK" : null,
				a.uk ? "UK" : null,
			].filter((v): v is string => v !== null);
			const meta = flags.length > 0 ? ` ${flags.join(", ")}` : "";
			const comment = a.comment ? ` "${a.comment}"` : "";
			lines.push(`        ${a.type} ${a.name}${meta}${comment}`);
		}
		for (const extra of e.extras) {
			lines.push(`        ${extra}`);
		}
		lines.push(`    }`);
	}
	for (const r of model.relations) {
		const label = r.label ? ` : ${r.label}` : "";
		lines.push(`    ${r.from} ${r.card} ${r.to}${label}`);
	}
	for (const extra of model.extras) {
		lines.push(`    ${extra}`);
	}
	return lines.join("\n");
}

export function addErEntity(model: ErModel, id: string): ErEntity {
	const existing = model.entities.find((e) => e.id === id);
	if (existing) return existing;
	const e: ErEntity = { id, attributes: [], extras: [] };
	model.entities.push(e);
	return e;
}

export type { ErModel, ErEntity, ErRelation };
