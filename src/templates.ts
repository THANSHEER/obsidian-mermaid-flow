/*
 * Built-in diagram templates shown in the "Insert from template" picker.
 */

import { DiagramModel } from "./model";

export interface DiagramTemplate {
	id: string;
	label: string;
	description: string;
	icon: string;
	model: () => DiagramModel;
}

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
	{
		id: "blank",
		label: "Blank diagram",
		description: "Start from an empty canvas",
		icon: "square",
		model: () => ({
			direction: "TB",
			nodes: [],
			edges: [],
			groups: [],
			config: {},
			classDefs: [],
			extras: [],
		}),
	},
	{
		id: "flowchart",
		label: "Basic flowchart",
		description: "Start → Process → Decision → End",
		icon: "git-branch",
		model: () => ({
			direction: "TB",
			nodes: [
				{ id: "A", label: "Start",    shape: "stadium" as const,  x: 200, y: 60  },
				{ id: "B", label: "Process",  shape: "rect" as const,     x: 200, y: 180 },
				{ id: "C", label: "Decision", shape: "diamond" as const,  x: 200, y: 310 },
				{ id: "D", label: "End",      shape: "stadium" as const,  x: 200, y: 460 },
				{ id: "E", label: "Alt path", shape: "rect" as const,     x: 400, y: 310 },
			],
			edges: [
				{ id: "e1", from: "A", to: "B", label: "", kind: "arrow" as const },
				{ id: "e2", from: "B", to: "C", label: "", kind: "arrow" as const },
				{ id: "e3", from: "C", to: "D", label: "Yes", kind: "arrow" as const },
				{ id: "e4", from: "C", to: "E", label: "No",  kind: "arrow" as const },
				{ id: "e5", from: "E", to: "D", label: "", kind: "arrow" as const },
			],
			groups: [],
			config: {},
			classDefs: [],
			extras: [],
		}),
	},
	{
		id: "decision-tree",
		label: "Decision tree",
		description: "Root decision branching into outcomes",
		icon: "network",
		model: () => ({
			direction: "TB",
			nodes: [
				{ id: "R",  label: "Question?",  shape: "diamond" as const, x: 300, y: 60  },
				{ id: "Y1", label: "Yes → A",    shape: "rect" as const,    x: 150, y: 200 },
				{ id: "N1", label: "No → B",     shape: "rect" as const,    x: 450, y: 200 },
				{ id: "Y2", label: "Option A1",  shape: "round" as const,   x: 80,  y: 340 },
				{ id: "Y3", label: "Option A2",  shape: "round" as const,   x: 240, y: 340 },
				{ id: "N2", label: "Option B1",  shape: "round" as const,   x: 370, y: 340 },
				{ id: "N3", label: "Option B2",  shape: "round" as const,   x: 530, y: 340 },
			],
			edges: [
				{ id: "e1", from: "R",  to: "Y1", label: "Yes", kind: "arrow" as const },
				{ id: "e2", from: "R",  to: "N1", label: "No",  kind: "arrow" as const },
				{ id: "e3", from: "Y1", to: "Y2", label: "", kind: "arrow" as const },
				{ id: "e4", from: "Y1", to: "Y3", label: "", kind: "arrow" as const },
				{ id: "e5", from: "N1", to: "N2", label: "", kind: "arrow" as const },
				{ id: "e6", from: "N1", to: "N3", label: "", kind: "arrow" as const },
			],
			groups: [],
			config: {},
			classDefs: [],
			extras: [],
		}),
	},
	{
		id: "process",
		label: "Linear process",
		description: "A sequence of numbered steps",
		icon: "list-ordered",
		model: () => ({
			direction: "LR",
			nodes: [
				{ id: "S1", label: "Step 1", shape: "rect" as const, x: 80,  y: 100 },
				{ id: "S2", label: "Step 2", shape: "rect" as const, x: 240, y: 100 },
				{ id: "S3", label: "Step 3", shape: "rect" as const, x: 400, y: 100 },
				{ id: "S4", label: "Step 4", shape: "rect" as const, x: 560, y: 100 },
			],
			edges: [
				{ id: "e1", from: "S1", to: "S2", label: "", kind: "arrow" as const },
				{ id: "e2", from: "S2", to: "S3", label: "", kind: "arrow" as const },
				{ id: "e3", from: "S3", to: "S4", label: "", kind: "arrow" as const },
			],
			groups: [],
			config: {},
			classDefs: [],
			extras: [],
		}),
	},
	{
		id: "org-chart",
		label: "Org chart",
		description: "Hierarchy with manager and reports",
		icon: "users",
		model: () => ({
			direction: "TB",
			nodes: [
				{ id: "CEO", label: "CEO",       shape: "rect" as const, x: 300, y: 60  },
				{ id: "VP1", label: "VP Eng",    shape: "rect" as const, x: 150, y: 200 },
				{ id: "VP2", label: "VP Sales",  shape: "rect" as const, x: 450, y: 200 },
				{ id: "E1",  label: "Engineer",  shape: "round" as const, x: 80,  y: 340 },
				{ id: "E2",  label: "Designer",  shape: "round" as const, x: 220, y: 340 },
				{ id: "S1",  label: "Sales Rep", shape: "round" as const, x: 380, y: 340 },
				{ id: "S2",  label: "Account Mgr", shape: "round" as const, x: 520, y: 340 },
			],
			edges: [
				{ id: "e1", from: "CEO", to: "VP1", label: "", kind: "arrow" as const },
				{ id: "e2", from: "CEO", to: "VP2", label: "", kind: "arrow" as const },
				{ id: "e3", from: "VP1", to: "E1",  label: "", kind: "arrow" as const },
				{ id: "e4", from: "VP1", to: "E2",  label: "", kind: "arrow" as const },
				{ id: "e5", from: "VP2", to: "S1",  label: "", kind: "arrow" as const },
				{ id: "e6", from: "VP2", to: "S2",  label: "", kind: "arrow" as const },
			],
			groups: [],
			config: {},
			classDefs: [],
			extras: [],
		}),
	},
];
