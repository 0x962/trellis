import { beforeEach, describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { CiState, PrState } from "@trellis/api";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { PrStateIcon } from "./PrStateIcon";

beforeEach(() => {
	mockMatchMedia(false);
});

const iconFor = (state: PrState, isDraft = false, ciState: CiState = "pass") => {
	const { container } = render(<PrStateIcon state={state} isDraft={isDraft} ciState={ciState} />);
	const icon = container.querySelector("[data-pr-state]");
	if (icon === null) throw new Error(`No state icon for ${state}.`);
	return icon;
};

const classOf = (icon: Element) => icon.getAttribute("class") ?? "";

describe("PrStateIcon", () => {
	// PR-11
	test("draws an open pull request in the success token", () => {
		const icon = iconFor("open");
		expect(icon.getAttribute("data-pr-state")).toBe("open");
		expect(classOf(icon)).toContain("text-success");
		expect(icon.textContent).toBe("Open");
	});

	// PR-12
	test("draws a draft pull request in the muted token", () => {
		const icon = iconFor("open", true);
		expect(icon.getAttribute("data-pr-state")).toBe("draft");
		expect(classOf(icon)).toContain("text-fg-muted");
		expect(icon.textContent).toBe("Draft");
	});

	// PR-13
	test("draws a merged pull request in the violet token", () => {
		const icon = iconFor("merged");
		expect(icon.getAttribute("data-pr-state")).toBe("merged");
		expect(classOf(icon)).toContain("text-agent");
		expect(icon.textContent).toBe("Merged");
	});

	// PR-14
	test("draws a closed pull request in the danger token", () => {
		const icon = iconFor("closed");
		expect(icon.getAttribute("data-pr-state")).toBe("closed");
		expect(classOf(icon)).toContain("text-danger");
		expect(icon.textContent).toBe("Closed");
	});

	// PR-16. A failed check is the only CI state that blocks a merge, so it
	// is the only one that changes the color of an open pull request.
	test("draws an open pull request with a failed check in the danger token", () => {
		const icon = iconFor("open", false, "fail");
		expect(icon.getAttribute("data-pr-state")).toBe("blocked");
		expect(classOf(icon)).toContain("text-danger");
		expect(icon.textContent).toBe("Blocked");
		for (const ciState of ["none", "pending", "pass"] as CiState[]) {
			expect(iconFor("open", false, ciState).getAttribute("data-pr-state"), ciState).toBe("open");
		}
	});

	// PR-17. A draft holds the muted tone, so a failed check on a draft never
	// reads as a blocked pull request.
	test("keeps a draft muted when a check fails", () => {
		const icon = iconFor("open", true, "fail");
		expect(icon.getAttribute("data-pr-state")).toBe("draft");
		expect(classOf(icon)).toContain("text-fg-muted");
	});

	// PR-15. Color is never the only signal, so a screen reader hears the
	// state as a word.
	test("names every pull request state in text", () => {
		const cases: [PrState, boolean, CiState, string][] = [
			["open", false, "pass", "Open"],
			["open", false, "fail", "Blocked"],
			["open", true, "pass", "Draft"],
			["merged", false, "pass", "Merged"],
			["closed", false, "pass", "Closed"],
		];
		for (const [state, isDraft, ciState, label] of cases) {
			const icon = iconFor(state, isDraft, ciState);
			const text = icon.querySelector("span.sr-only");
			expect(text, label).not.toBeNull();
			expect(text!.textContent).toBe(label);
			expect(icon.getAttribute("aria-hidden")).toBeNull();
		}
	});
});
