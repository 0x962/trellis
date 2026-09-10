import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { checkList } from "../../../../../../../../test/prs";
import { tabularClass } from "../../../../../../../lib/format";
import { CheckCountPill } from "./CheckCountPill";

const pill = () => {
	const element = document.querySelector("[data-check-pill]");
	if (element === null) throw new Error("No check count pill.");
	return element;
};

const failing = checkList(["lint", "pass"], ["typecheck", "fail"], ["build", "pending"]);
const pending = checkList(["lint", "pass"], ["build", "pending"]);
const passing = checkList(["lint", "pass"], ["build", "pass"]);

describe("CheckCountPill", () => {
	// PR-16
	test("takes its tone from the worst bucket", () => {
		const { rerender } = render(<CheckCountPill checks={failing} />);
		expect(pill().getAttribute("data-tone")).toBe("danger");
		rerender(<CheckCountPill checks={pending} />);
		expect(pill().getAttribute("data-tone")).toBe("warning");
		rerender(<CheckCountPill checks={passing} />);
		expect(pill().getAttribute("data-tone")).toBe("success");
	});

	// PR-17. A pull request without checks says so, and says nothing about
	// a state it does not know.
	test("reads No checks for an empty check list", () => {
		render(<CheckCountPill checks={[]} />);
		expect(pill().textContent).toBe("No checks");
		expect(pill().getAttribute("data-tone")).toBe("muted");
	});

	// PR-18. Counts line up between rows.
	test("sets tabular numbers on the counts", () => {
		render(<CheckCountPill checks={failing} />);
		expect(pill().getAttribute("class")).toContain(tabularClass);
	});
});
