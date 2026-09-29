import { expect, test } from "bun:test";
import type { FlowExecutionIdentityV1 } from "@trellis/api";
import { runIndexState } from "./runIndexState";

test("a hidden pending execution blocks its flow without blocking unrelated flows", () => {
	const records: FlowExecutionIdentityV1[] = Array.from({ length: 501 }, (_, index) => ({
		id: String(index).padStart(26, "0"),
		engine: "langflow",
		flowId: "completed-flow",
		status: "succeeded",
		pendingSubmission: false,
	}));
	records.push({ id: "hidden-run", engine: "langflow", flowId: "pending-flow", status: null, pendingSubmission: true });
	const state = runIndexState(records);
	expect(state.pendingFlowIds).toEqual(["pending-flow"]);
	expect(state.activeFlowIds.has("pending-flow")).toBe(true);
	expect(state.activeFlowIds.has("completed-flow")).toBe(false);
});

test("live legacy runs and confirmed native waits prevent a repeat of their own flow", () => {
	const state = runIndexState([
		{ id: "legacy", engine: "legacy", flowId: "first", status: "running", pendingSubmission: false },
		{ id: "native", engine: "langflow", flowId: "second", status: "waiting", pendingSubmission: false },
	]);
	expect(state.pendingFlowIds).toEqual([]);
	expect([...state.activeFlowIds]).toEqual(["first", "second"]);
});
