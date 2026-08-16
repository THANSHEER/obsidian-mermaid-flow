import { App, Modal, Notice, Setting } from "obsidian";
import {
	submitFeedback,
	submitFeatureRequest,
	submitUninstall,
} from "./api";
import {
	FEEDBACK_TOPICS,
	UNINSTALL_REASONS,
	type FeedbackTopic,
	type UninstallReasonCode,
} from "./constants";
import { fetchReleaseNotes, type ReleaseNotes } from "./releaseNotes";

/**
 * Displays a status message or hides and clears the status element.
 *
 * @param el - The element used to display the status
 * @param text - The status message, or `null` to hide and clear it
 */
function setStatus(el: HTMLElement | null, text: string | null): void {
	if (!el) return;
	if (!text) {
		el.hide();
		el.setText("");
		return;
	}
	el.setText(text);
	el.show();
}

export class FeedbackModal extends Modal {
	private topic: FeedbackTopic;
	private message = "";
	private rating: number | undefined;
	private email = "";
	private submitting = false;
	private errorEl: HTMLElement | null = null;
	private submitBtn: HTMLButtonElement | null = null;

	constructor(app: App, topic: FeedbackTopic = "settings") {
		super(app);
		this.topic = topic;
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-feedback-modal");
		this.titleEl.setText("Give feedback");
		const content = this.contentEl;

		content.createEl("p", {
			cls: "setting-item-description",
			text: "Tell us what works and what doesn’t. Optional — no account required.",
		});

		new Setting(content)
			.setName("Topic")
			.addDropdown((dd) => {
				for (const t of FEEDBACK_TOPICS) dd.addOption(t.value, t.label);
				dd.setValue(this.topic);
				dd.onChange((v) => {
					this.topic = v as FeedbackTopic;
				});
			});

		new Setting(content)
			.setName("Rating (optional)")
			.addDropdown((dd) => {
				dd.addOption("", "—");
				for (let i = 5; i >= 1; i--) dd.addOption(String(i), `${i} / 5`);
				dd.onChange((v) => {
					this.rating = v ? Number(v) : undefined;
				});
			});

		new Setting(content)
			.setName("Message")
			.setDesc("What should we know?")
			.addTextArea((ta) => {
				ta.setPlaceholder("Your feedback…");
				ta.inputEl.rows = 5;
				ta.inputEl.addClass("mermaid-flow-feedback-textarea");
				ta.onChange((v) => {
					this.message = v;
				});
			});

		new Setting(content)
			.setName("Email (optional)")
			.addText((text) => {
				text.setPlaceholder("you@example.com");
				text.onChange((v) => {
					this.email = v;
				});
			});

		this.errorEl = content.createEl("p", { cls: "mermaid-flow-feedback-error" });
		this.errorEl.hide();

		const footer = content.createDiv({ cls: "mermaid-flow-feedback-footer" });
		const cancel = footer.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		this.submitBtn = footer.createEl("button", { text: "Send feedback", cls: "mod-cta" });
		this.submitBtn.addEventListener("click", () => {
			this.submit().catch((e) => console.error("[mermaid-flow]", e));
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (this.submitting) return;
		this.submitting = true;
		this.submitBtn?.setAttribute("disabled", "true");
		setStatus(this.errorEl, null);

		const result = await submitFeedback({
			topic: this.topic,
			message: this.message,
			rating: this.rating,
			email: this.email || undefined,
		});

		this.submitting = false;
		this.submitBtn?.removeAttribute("disabled");

		if (!result.ok) {
			setStatus(this.errorEl, result.error);
			return;
		}
		new Notice("Thanks — feedback sent.");
		this.close();
	}
}

export class FeatureRequestModal extends Modal {
	private email = "";
	private requestTitle = "";
	private requestDetails = "";
	private submitting = false;
	private errorEl: HTMLElement | null = null;
	private submitBtn: HTMLButtonElement | null = null;

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-feedback-modal");
		this.titleEl.setText("Request a feature");
		const content = this.contentEl;

		content.createEl("p", {
			cls: "setting-item-description",
			text: "Describe the feature you’d like. We’ll use your email only to follow up.",
		});

		new Setting(content)
			.setName("Email")
			.addText((text) => {
				text.setPlaceholder("you@example.com");
				text.onChange((v) => {
					this.email = v;
				});
			});

		new Setting(content)
			.setName("Title")
			.addText((text) => {
				text.setPlaceholder("Short summary");
				text.onChange((v) => {
					this.requestTitle = v;
				});
			});

		new Setting(content)
			.setName("Details")
			.addTextArea((ta) => {
				ta.setPlaceholder("What should it do? Any examples?");
				ta.inputEl.rows = 6;
				ta.inputEl.addClass("mermaid-flow-feedback-textarea");
				ta.onChange((v) => {
					this.requestDetails = v;
				});
			});

		this.errorEl = content.createEl("p", { cls: "mermaid-flow-feedback-error" });
		this.errorEl.hide();

		const footer = content.createDiv({ cls: "mermaid-flow-feedback-footer" });
		const cancel = footer.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		this.submitBtn = footer.createEl("button", { text: "Submit request", cls: "mod-cta" });
		this.submitBtn.addEventListener("click", () => {
			this.submit().catch((e) => console.error("[mermaid-flow]", e));
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (this.submitting) return;
		this.submitting = true;
		this.submitBtn?.setAttribute("disabled", "true");
		setStatus(this.errorEl, null);

		const result = await submitFeatureRequest({
			email: this.email,
			title: this.requestTitle,
			details: this.requestDetails,
		});

		this.submitting = false;
		this.submitBtn?.removeAttribute("disabled");

		if (!result.ok) {
			setStatus(this.errorEl, result.error);
			return;
		}
		new Notice("Thanks — feature request sent.");
		this.close();
	}
}

export class UninstallModal extends Modal {
	private selected = new Set<UninstallReasonCode>();
	private message = "";
	private submitting = false;
	private errorEl: HTMLElement | null = null;
	private submitBtn: HTMLButtonElement | null = null;

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-feedback-modal");
		this.titleEl.setText("Uninstall feedback");
		const content = this.contentEl;

		content.createEl("p", {
			cls: "setting-item-description",
			text: "Sorry to see you go. A short note helps us improve Mermaid Flow for everyone else.",
		});

		const list = content.createDiv({
			cls: "mermaid-flow-feedback-reasons",
			attr: { role: "group", "aria-label": "Reasons for uninstalling" },
		});

		for (const reason of UNINSTALL_REASONS) {
			const label = list.createEl("label", { cls: "mermaid-flow-feedback-reason" });
			const input = label.createEl("input", { type: "checkbox" });
			input.addEventListener("change", () => {
				if (input.checked) this.selected.add(reason.value);
				else this.selected.delete(reason.value);
				label.toggleClass("is-on", input.checked);
			});
			const text = label.createDiv();
			text.createEl("strong", { text: reason.title });
			text.createEl("span", { text: reason.description });
		}

		new Setting(content)
			.setName("Anything else? (optional)")
			.addTextArea((ta) => {
				ta.setPlaceholder("Anything else you’d like to share?");
				ta.inputEl.rows = 3;
				ta.inputEl.addClass("mermaid-flow-feedback-textarea");
				ta.onChange((v) => {
					this.message = v;
				});
			});

		this.errorEl = content.createEl("p", { cls: "mermaid-flow-feedback-error" });
		this.errorEl.hide();

		const footer = content.createDiv({ cls: "mermaid-flow-feedback-footer" });
		const skip = footer.createEl("button", { text: "Skip" });
		skip.addEventListener("click", () => this.close());
		this.submitBtn = footer.createEl("button", { text: "Send feedback", cls: "mod-cta" });
		this.submitBtn.addEventListener("click", () => {
			this.submit().catch((e) => console.error("[mermaid-flow]", e));
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (this.submitting) return;
		this.submitting = true;
		this.submitBtn?.setAttribute("disabled", "true");
		setStatus(this.errorEl, null);

		const result = await submitUninstall({
			reasons: [...this.selected],
			message: this.message || undefined,
		});

		this.submitting = false;
		this.submitBtn?.removeAttribute("disabled");

		if (!result.ok) {
			setStatus(this.errorEl, result.error);
			return;
		}
		new Notice("Thanks — uninstall feedback sent.");
		this.close();
	}
}

export class UpdateModal extends Modal {
	private notes: ReleaseNotes | null = null;
	private loadingEl: HTMLElement | null = null;
	private notesEl: HTMLElement | null = null;

	constructor(
		app: App,
		private version: string,
		private previousVersion: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("mermaid-flow-feedback-modal");
		this.modalEl.addClass("mermaid-flow-update-modal");
		this.titleEl.setText(`Updated to ${this.version}`);
		const content = this.contentEl;

		content.createEl("p", {
			cls: "setting-item-description",
			text:
				this.previousVersion
					? `Mermaid Flow moved from ${this.previousVersion} to ${this.version}. Here’s what changed:`
					: `Mermaid Flow is now at ${this.version}. Here’s what changed:`,
		});

		this.loadingEl = content.createEl("p", {
			cls: "mermaid-flow-feedback-loading",
			text: "Loading release notes…",
		});
		this.notesEl = content.createDiv({ cls: "mermaid-flow-feedback-notes" });
		this.notesEl.hide();

		const footer = content.createDiv({ cls: "mermaid-flow-feedback-footer" });
		const feedbackBtn = footer.createEl("button", {
			text: "Give feedback",
			cls: "mod-cta",
		});
		feedbackBtn.addEventListener("click", () => {
			this.close();
			new FeedbackModal(this.app, "update").open();
		});
		const closeBtn = footer.createEl("button", { text: "Close" });
		closeBtn.addEventListener("click", () => this.close());

		this.loadNotes().catch((e) => console.error("[mermaid-flow]", e));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async loadNotes(): Promise<void> {
		this.notes = await fetchReleaseNotes(this.version);
		this.loadingEl?.hide();
		if (!this.notesEl) return;
		this.notesEl.empty();
		this.notesEl.show();

		const heading = this.notesEl.createEl("h3", {
			cls: "mermaid-flow-feedback-notes-title",
			text: this.notes.name,
		});
		void heading;

		const body = this.notesEl.createEl("pre", {
			cls: "mermaid-flow-feedback-notes-body",
			text: this.notes.body,
		});
		void body;

		const link = this.notesEl.createEl("a", {
			cls: "mermaid-flow-feedback-notes-link",
			text: "View on GitHub",
			attr: { href: this.notes.htmlUrl },
		});
		link.addEventListener("click", (e) => {
			e.preventDefault();
			activeWindow.open(this.notes!.htmlUrl);
		});
	}
}
