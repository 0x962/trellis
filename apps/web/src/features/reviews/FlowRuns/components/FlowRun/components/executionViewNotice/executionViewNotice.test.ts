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
