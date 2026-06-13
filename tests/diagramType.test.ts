import { describe, expect, it } from "vitest";
import {
	detectDiagramType,
	isVisuallyEditable,
	describeDiagramType,
	OPEN_FENCE_RE,
} from "../src/diagramType";

describe("detectDiagramType", () => {
	it.each([
		["flowchart TD\nA --> B", "flowchart"],
		["flowchart LR", "flowchart"],
		["graph TD\nA --> B", "flowchart"],
		["sequenceDiagram\nAlice->>Bob: Hi", "sequence"],
		["classDiagram\nAnimal <|-- Duck", "class"],
		["classDiagram-v2", "class"],
		["stateDiagram\n[*] --> Idle", "state"],
		["stateDiagram-v2\n[*] --> Idle", "state"],
		["erDiagram\nCUSTOMER ||--o{ ORDER : places", "er"],
		["gantt\ntitle A Gantt", "gantt"],
		["pie showData\n\"Dogs\": 50", "pie"],
		["pie\n\"Dogs\": 50", "pie"],
		["journey\ntitle My day", "journey"],
		["gitGraph\ncommit", "git"],
		["gitGraph TB:\ncommit", "git"],
		["mindmap\n  root((mindmap))", "mindmap"],
		["timeline\ntitle Timeline", "timeline"],
		["quadrantChart\ntitle Reach", "quadrant"],
		["requirementDiagram\nrequirement r {}", "requirement"],
		["C4Context\ntitle System", "c4"],
		["C4Container\n", "c4"],
		["sankey-beta\nA,B,10", "sankey"],
		["xychart-beta\ntitle Sales", "xychart"],
		["block-beta\ncolumns 3", "block"],
		["packet-beta\n0-15: \"Source\"", "packet"],
		["kanban\n  Todo", "kanban"],
		["architecture-beta\ngroup api", "architecture"],
		["zenuml\nA.method()", "zenuml"],
	])("detects %s", (source, expected) => {
		expect(detectDiagramType(source)).toBe(expected);
	});

	it("returns unknown for headerless node/edge snippets", () => {
		expect(detectDiagramType("A --> B")).toBe("unknown");
		expect(detectDiagramType("A[Start] --> B{Choice}")).toBe("unknown");
	});

	it("is not fooled by node ids that resemble diagram keywords", () => {
		expect(detectDiagramType("pie[Pie chart] --> B")).toBe("unknown");
		expect(detectDiagramType("graph[A graph node]")).toBe("unknown");
		expect(detectDiagramType("kanban[Board] --> Done")).toBe("unknown");
	});

	it("skips blank lines and %% comments", () => {
		expect(
			detectDiagramType("\n%% a comment\n\nsequenceDiagram\nA->>B: x"),
		).toBe("sequence");
	});

	it("skips %%{init}%% directives", () => {
		expect(
			detectDiagramType('%%{init: {"theme": "dark"}}%%\ngantt\ntitle G'),
		).toBe("gantt");
	});

	it("skips YAML frontmatter", () => {
		expect(
			detectDiagramType("---\ntitle: My diagram\n---\nflowchart TD\nA --> B"),
		).toBe("flowchart");
		expect(
			detectDiagramType("---\nconfig:\n  theme: forest\n---\nmindmap\n  root"),
		).toBe("mindmap");
	});

	it("returns unknown for empty input", () => {
		expect(detectDiagramType("")).toBe("unknown");
		expect(detectDiagramType("\n\n  \n")).toBe("unknown");
	});
});

describe("isVisuallyEditable", () => {
	it("allows flowcharts and unknown snippets", () => {
		expect(isVisuallyEditable("flowchart")).toBe(true);
		expect(isVisuallyEditable("unknown")).toBe(true);
	});

	it("blocks known non-flowchart types", () => {
		expect(isVisuallyEditable("sequence")).toBe(false);
		expect(isVisuallyEditable("gantt")).toBe(false);
		expect(isVisuallyEditable("class")).toBe(false);
		expect(isVisuallyEditable("mindmap")).toBe(false);
	});
});

describe("describeDiagramType", () => {
	it("names every type", () => {
		expect(describeDiagramType("sequence")).toBe("sequence diagram");
		expect(describeDiagramType("gantt")).toBe("Gantt chart");
		expect(describeDiagramType("unknown")).toBe("diagram");
	});
});

describe("OPEN_FENCE_RE", () => {
	it("matches mermaid fences", () => {
		expect(OPEN_FENCE_RE.test("```mermaid")).toBe(true);
		expect(OPEN_FENCE_RE.test("  ~~~~mermaid")).toBe(true);
		expect(OPEN_FENCE_RE.test("```js")).toBe(false);
	});
});
