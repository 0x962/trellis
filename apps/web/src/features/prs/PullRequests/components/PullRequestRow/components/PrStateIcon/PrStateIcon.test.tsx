import { beforeEach, describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { PrState } from "@trellis/api";
import { mockMatchMedia } from "../../../../../../../../test/media";
import { PrStateIcon } from "./PrStateIcon";

beforeEach(() => {
	mockMatchMedia(false);
});

const iconFor = (state: PrState, isDraft = false) => {
	const { container } = render(<PrStateIcon state={state} isDraft={isDraft} />);
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

	// PR-12. A draft carries a shape of its own, so gray is not the signal.
	test("draws a draft pull request with a dashed outline", () => {
		const icon = iconFor("open", true);
		expect(icon.getAttribute("data-pr-state")).toBe("draft");
		expect(classOf(icon)).toContain("border-dashed");
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

	// PR-15. Color is never the only signal, so a screen reader hears the
	// state as a word.
	test("names every pull request state in text", () => {
		const cases: [PrState, boolean, string][] = [
			["open", false, "Open"],
			["open", true, "Draft"],
			["merged", false, "Merged"],
			["closed", false, "Closed"],
		];
		for (const [state, isDraft, label] of cases) {
			const icon = iconFor(state, isDraft);
			const text = icon.querySelector("span.sr-only");
			expect(text, label).not.toBeNull();
			expect(text!.textContent).toBe(label);
			expect(icon.getAttribute("aria-hidden")).toBeNull();
		}
	});
});
