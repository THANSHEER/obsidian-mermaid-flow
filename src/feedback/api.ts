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

/** Build JSON body for general feedback (unit-testable, no network). */
export function buildFeedbackBody(payload: FeedbackPayload): Record<string, unknown> {
	const body: Record<string, unknown> = { topic: payload.topic.trim() };
	if (payload.message?.trim()) body.message = payload.message.trim();
	if (payload.choice?.trim()) body.choice = payload.choice.trim();
	if (payload.email?.trim()) body.email = payload.email.trim();
	if (payload.rating !== undefined) body.rating = payload.rating;
	return body;
}

export function buildFeatureRequestBody(
	payload: FeatureRequestPayload,
): Record<string, unknown> {
	return {
		email: payload.email.trim(),
		title: payload.title.trim(),
		details: payload.details.trim(),
	};
}

export function buildUninstallBody(payload: UninstallPayload): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (payload.reasons && payload.reasons.length > 0) body.reasons = payload.reasons;
	if (payload.message?.trim()) body.message = payload.message.trim();
	if (payload.rating !== undefined) body.rating = payload.rating;
	return body;
}

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

export async function submitFeedback(payload: FeedbackPayload): Promise<ApiResult> {
	const err = validateFeedback(payload);
	if (err) return { ok: false, error: err };
	return postJson(productUrl("feedback"), buildFeedbackBody(payload));
}

export async function submitFeatureRequest(
	payload: FeatureRequestPayload,
): Promise<ApiResult> {
	const err = validateFeatureRequest(payload);
	if (err) return { ok: false, error: err };
	return postJson(productUrl("feature-requests"), buildFeatureRequestBody(payload));
}

export async function submitUninstall(payload: UninstallPayload): Promise<ApiResult> {
	return postJson(productUrl("uninstall"), buildUninstallBody(payload));
}
