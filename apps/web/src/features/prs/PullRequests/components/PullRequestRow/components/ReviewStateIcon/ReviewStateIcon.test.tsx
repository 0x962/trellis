import { beforeEach, describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { ReviewState } from "@trellis/api";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { ReviewStateIcon } from "./ReviewStateIcon";

beforeEach(() => {
	mockMatchMedia(false);
});

const iconFor = (reviewState: ReviewState, isDraft = false) => {
	const { container } = render(<ReviewStateIcon reviewState={reviewState} isDraft={isDraft} />);
	const icon = container.querySelector("[data-review-state]");
	if (icon === null) throw new Error(`No review icon for ${reviewState}.`);
	return icon;
};

const classOf = (icon: Element) => icon.getAttribute("class") ?? "";

describe("ReviewStateIcon", () => {
	// PR-18
	test("draws an approved review in the success token", () => {
		const icon = iconFor("approved");
		expect(icon.getAttribute("data-review-state")).toBe("approved");
		expect(classOf(icon)).toContain("text-success");
	});

	// PR-19
	test("draws a requested review in the warning token", () => {
		const icon = iconFor("review_required");
		expect(icon.getAttribute("data-review-state")).toBe("waiting");
		expect(classOf(icon)).toContain("text-warning");
	});

	// PR-20
	test("draws a review nobody asked for in the muted token", () => {
		const icon = iconFor("none");
		expect(icon.getAttribute("data-review-state")).toBe("idle");
		expect(classOf(icon)).toContain("text-fg-muted");
	});

	// PR-21
	test("draws a changes-requested review in the danger token", () => {
		const icon = iconFor("changes_requested");
		expect(icon.getAttribute("data-review-state")).toBe("changes");
		expect(classOf(icon)).toContain("text-danger");
	});

	// PR-22. Nobody reviews a draft, so a draft holds the muted icon whatever
	// gh reports.
	test("draws every draft as a review nobody asked for", () => {
		for (const state of ["none", "review_required", "approved", "changes_requested"] as ReviewState[]) {
			const icon = iconFor(state, true);
			expect(icon.getAttribute("data-review-state"), state).toBe("idle");
			expect(classOf(icon), state).toContain("text-fg-muted");
		}
	});

	// PR-23. Color is never the only signal, so a screen reader hears the
	// review state as a word.
	test("names every review state in text", () => {
		const cases: [ReviewState, string][] = [
			["approved", "Approved"],
			["review_required", "Review requested"],
			["changes_requested", "Changes requested"],
			["none", "No review requested"],
		];
		for (const [state, label] of cases) {
			const icon = iconFor(state);
			expect(icon.querySelector("span.sr-only")!.textContent, state).toBe(label);
		}
	});
});
