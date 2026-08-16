import { requestUrl } from "obsidian";
import { productUrl, type FeedbackTopic, type UninstallReasonCode } from "./constants";

export interface FeedbackPayload {
	topic: FeedbackTopic | string;
	message?: string;
	rating?: number;
	email?: string;
	choice?: string;
}

export interface FeatureRequestPayload {
	email: string;
	title: string;
	details: string;
}

export interface UninstallPayload {
	reasons?: UninstallReasonCode[];
	message?: string;
	rating?: number;
}

export type ApiResult = { ok: true } | { ok: false; error: string };

/**
 * Builds a JSON-ready body for general feedback.
 *
 * @param payload - The feedback data to include in the request body
 * @returns An object containing the trimmed topic, nonempty optional text fields, and defined rating
 */
export function buildFeedbackBody(payload: FeedbackPayload): Record<string, unknown> {
	const body: Record<string, unknown> = { topic: payload.topic.trim() };
	if (payload.message?.trim()) body.message = payload.message.trim();
	if (payload.choice?.trim()) body.choice = payload.choice.trim();
	if (payload.email?.trim()) body.email = payload.email.trim();
	if (payload.rating !== undefined) body.rating = payload.rating;
	return body;
}

/**
 * Builds the request body for a feature request.
 *
 * @param payload - The feature request data to format
 * @returns An object containing trimmed email, title, and details
 */
export function buildFeatureRequestBody(
	payload: FeatureRequestPayload,
): Record<string, unknown> {
	return {
		email: payload.email.trim(),
		title: payload.title.trim(),
		details: payload.details.trim(),
	};
}

/**
 * Builds the request body for an uninstall submission.
 *
 * @param payload - The uninstall information to include in the request body
 * @returns An object containing nonempty reasons, a trimmed message, and a defined rating
 */
export function buildUninstallBody(payload: UninstallPayload): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (payload.reasons && payload.reasons.length > 0) body.reasons = payload.reasons;
	if (payload.message?.trim()) body.message = payload.message.trim();
	if (payload.rating !== undefined) body.rating = payload.rating;
	return body;
}

/**
 * Validates the required topic and content constraints for feedback.
 *
 * @param payload - The feedback data to validate
 * @returns An error message when validation fails, or `null` when the payload is valid
 */
export function validateFeedback(payload: FeedbackPayload): string | null {
	if (!payload.topic.trim()) return "Topic is required.";
	const hasMessage = Boolean(payload.message?.trim());
	const hasChoice = Boolean(payload.choice?.trim());
	const hasRating = payload.rating !== undefined;
	if (!hasMessage && !hasChoice && !hasRating) {
		return "Provide a message and/or rating.";
	}
	if (payload.rating !== undefined && (payload.rating < 1 || payload.rating > 5)) {
		return "Rating must be between 1 and 5.";
	}
	if (payload.message && payload.message.length > 2000) {
		return "Message is too long (max 2000 characters).";
	}
	return null;
}

/**
 * Validates the required fields and length limits for a feature request.
 *
 * @param payload - The feature request data to validate
 * @returns An error message for the first invalid field, or `null` when the payload is valid
 */
export function validateFeatureRequest(payload: FeatureRequestPayload): string | null {
	if (!payload.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
		return "A valid email is required.";
	}
	if (!payload.title.trim()) return "Title is required.";
	if (payload.title.trim().length > 150) return "Title is too long (max 150 characters).";
	if (!payload.details.trim()) return "Details are required.";
	if (payload.details.trim().length > 2000) {
		return "Details are too long (max 2000 characters).";
	}
	return null;
}

/**
 * Sends a JSON payload to an endpoint and normalizes the response.
 *
 * @param url - The endpoint URL
 * @param body - The JSON request payload
 * @returns A successful result for HTTP 201 responses; otherwise, a failure result with an error message
 */
async function postJson(url: string, body: Record<string, unknown>): Promise<ApiResult> {
	try {
		const res = await requestUrl({
			url,
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			throw: false,
		});
		if (res.status === 201) return { ok: true };
		let error = `Request failed (HTTP ${res.status}).`;
		try {
			const data = res.json as { error?: string };
			if (data?.error) error = data.error;
		} catch {
			// keep default
		}
		return { ok: false, error };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Could not reach the server.",
		};
	}
}

/**
 * Validates and submits feedback data.
 *
 * @param payload - The feedback details to validate and submit
 * @returns A successful result when the feedback is accepted, or an error result when validation or submission fails
 */
export async function submitFeedback(payload: FeedbackPayload): Promise<ApiResult> {
	const err = validateFeedback(payload);
	if (err) return { ok: false, error: err };
	return postJson(productUrl("feedback"), buildFeedbackBody(payload));
}

/**
 * Validates and submits a feature request.
 *
 * @param payload - The feature request data to submit
 * @returns The submission result, including an error message when validation or submission fails
 */
export async function submitFeatureRequest(
	payload: FeatureRequestPayload,
): Promise<ApiResult> {
	const err = validateFeatureRequest(payload);
	if (err) return { ok: false, error: err };
	return postJson(productUrl("feature-requests"), buildFeatureRequestBody(payload));
}

/**
 * Submits an uninstall report.
 *
 * @param payload - The uninstall report data to submit
 * @returns The submission result
 */
export async function submitUninstall(payload: UninstallPayload): Promise<ApiResult> {
	return postJson(productUrl("uninstall"), buildUninstallBody(payload));
}
