import { expect, test } from "bun:test";
import { executionViewV1Example, occurrenceV1Example, unknownDecisionV1Example } from "@trellis/api";
import { decisionView } from "./decisionView";

test("an unknown native wait never exposes a human decision", () => {
	const execution = { ...executionViewV1Example, occurrences: [occurrenceV1Example] };
	expect(decisionView(execution, occurrenceV1Example.actionKey).waiting).toBeFalse();
});

test("every delivery state retains rejection and complete notes", () => {
	for (const state of ["recorded", "pending", "unknown", "confirmed"] as const) {
		const delivery =
			state === "confirmed"
				? {
						...unknownDecisionV1Example,
						state,
						approved: false,
						acceptedReceiptId: "receipt",
						confirmedAt: "2026-09-29T17:00:00Z",
					}
				: { ...unknownDecisionV1Example, state, approved: false, acceptedReceiptId: null, confirmedAt: null };
		const execution = { ...executionViewV1Example, decisionDeliveries: [{ ...delivery, output: "n".repeat(200_001) }] };
		const view = decisionView(execution, occurrenceV1Example.actionKey);
		expect(view.delivery?.state).toBe(state);
		expect(view.delivery?.approved).toBeFalse();
		expect(view.delivery?.output.length).toBe(200_001);
	}
});

test("a removed action keeps the dialog readable", () => {
	const view = decisionView(executionViewV1Example, "removed");
	expect(view.waiting).toBeFalse();
	expect(view.title).toBe("Decision unavailable");
});
