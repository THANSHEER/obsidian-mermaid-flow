import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
	requestUrl: vi.fn(),
}));

import {
	buildFeedbackBody,
	buildFeatureRequestBody,
	buildUninstallBody,
	validateFeedback,
	validateFeatureRequest,
} from "../src/feedback/api";
import { productUrl, PRODUCT_SLUG, API_BASE } from "../src/feedback/constants";

describe("feedback API helpers", () => {
	it("builds product URLs under the mermaid-flow slug", () => {
		expect(PRODUCT_SLUG).toBe("mermaid-flow");
		expect(productUrl("feedback")).toBe(
			`${API_BASE}/products/mermaid-flow/feedback`,
		);
		expect(productUrl("feature-requests")).toBe(
			`${API_BASE}/products/mermaid-flow/feature-requests`,
		);
		expect(productUrl("uninstall")).toBe(
			`${API_BASE}/products/mermaid-flow/uninstall`,
		);
	});

	it("builds feedback body with only provided fields", () => {
		expect(
			buildFeedbackBody({ topic: "settings", message: "  hello  ", rating: 4 }),
		).toEqual({ topic: "settings", message: "hello", rating: 4 });
		expect(buildFeedbackBody({ topic: "ui", rating: 5 })).toEqual({
			topic: "ui",
			rating: 5,
		});
	});

	it("validates feedback requires message or rating", () => {
		expect(validateFeedback({ topic: "settings" })).toMatch(/message|rating/i);
		expect(validateFeedback({ topic: "settings", message: "ok" })).toBeNull();
		expect(validateFeedback({ topic: "settings", rating: 3 })).toBeNull();
		expect(validateFeedback({ topic: "settings", rating: 9 })).toMatch(/1 and 5/);
	});

	it("builds and validates feature requests", () => {
		expect(
			buildFeatureRequestBody({
				email: " a@b.co ",
				title: " Nested subgraphs ",
				details: " Support deeper nesting. ",
			}),
		).toEqual({
			email: "a@b.co",
			title: "Nested subgraphs",
			details: "Support deeper nesting.",
		});
		expect(
			validateFeatureRequest({ email: "bad", title: "x", details: "y" }),
		).toMatch(/email/i);
		expect(
			validateFeatureRequest({
				email: "a@b.co",
				title: "Title",
				details: "Details here",
			}),
		).toBeNull();
	});

	it("builds uninstall body with optional reasons and message", () => {
		expect(buildUninstallBody({})).toEqual({});
		expect(
			buildUninstallBody({
				reasons: ["feature", "performance"],
				message: " missing shapes ",
			}),
		).toEqual({
			reasons: ["feature", "performance"],
			message: "missing shapes",
		});
	});
});
