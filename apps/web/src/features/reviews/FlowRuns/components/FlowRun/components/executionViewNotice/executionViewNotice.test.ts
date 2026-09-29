import { expect, test } from "bun:test";
import { executionViewV1Example, stopPendingV1Example, unknownAdmissionV1Example } from "@trellis/api";
import { executionViewNotice } from "./executionViewNotice";

test("keeps earlier-head success separate from review readiness", () => {
	const notice = executionViewNotice(
		{ ...executionViewV1Example, status: "succeeded", detail: "completed" },
		"current",
		false,
	);
	expect(notice).toContain("Review readiness has separate checks");
	expect(notice).toContain("another commit");
	expect(notice).toContain("Diff association unknown");
});

test("identifies recovery and read-only history without an engine request", () => {
	const notice = executionViewNotice(unknownAdmissionV1Example, "current", true);
	expect(notice).toContain("read-only");
	expect(notice).toContain("confirmed engine ownership");
	expect(notice).toContain("Native admission is closed");
});

test("counts only unresolved stop obligations", () => {
	const notice = executionViewNotice(stopPendingV1Example, "current", true);
	expect(notice).toContain("1 worker stops await confirmation");
});

test("names review classification separately from a native result or human decision", () => {
	const notice = executionViewNotice(
		{ ...executionViewV1Example, status: "waiting", detail: "waiting_review" },
		"current",
		false,
	);
	expect(notice).toContain("The run awaits review classification.");
	expect(notice).not.toContain("awaits a native result");
	expect(notice).not.toContain("needs a human decision");
});
