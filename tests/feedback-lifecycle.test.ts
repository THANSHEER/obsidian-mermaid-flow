import { describe, it, expect } from "vitest";
import { planVersionAction } from "../src/feedback/version";

describe("planVersionAction", () => {
	it("records version on first run", () => {
		expect(planVersionAction(null, "1.5.0")).toBe("record");
		expect(planVersionAction(undefined, "1.5.0")).toBe("record");
		expect(planVersionAction("", "1.5.0")).toBe("record");
	});

	it("opens update when the version changed", () => {
		expect(planVersionAction("1.4.4", "1.5.0")).toBe("update");
	});

	it("is a no-op when versions match", () => {
		expect(planVersionAction("1.5.0", "1.5.0")).toBe("noop");
	});
});
