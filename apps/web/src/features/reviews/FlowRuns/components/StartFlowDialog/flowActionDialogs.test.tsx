import { expect, test } from "bun:test";
import {
	type FlowExecutionDecisionInput,
	type FlowExecutionViewV1,
	occurrenceV1Example,
	publishedDocumentV1Example,
	stopPendingV1Example,
	unknownDecisionV1Example,
} from "@trellis/api";
import { act } from "react";
import {
	execution,
	fixture,
	flush,
	FlowDecisionDialog,
	FlowCancelDialog,
	FlowTaskTerminal,
	StartFlowDialog,
} from "./actionDialogFixture";

test("notes have no implicit approval and rejection uses the displayed revision", async () => {
	const calls: FlowExecutionDecisionInput[] = [];
	const f = fixture({
		flowExecutionsV1: {
			decision: async (input: FlowExecutionDecisionInput) => {
				calls.push(input);
				throw new Error("Lost acknowledgement");
			},
		},
	});
	const render = () => (
		<FlowDecisionDialog execution={execution} actionKey="review-37" recoveryBlocked={false} onClose={() => {}} />
	);
	await f.render(render());
	expect(f.root.container.queryAll((node) => node.type === "form")).toHaveLength(0);
	expect(f.button("Approve step").props.type).toBe("button");
	const notes = "n".repeat(200_001);
	await act(async () =>
		f.root.container.queryAll((node) => node.type === "textarea")[0]!.props.onChange({ target: { value: notes } }),
	);
	await act(async () => f.button("Reject step").props.onClick());
	await flush();
	expect(calls).toEqual([{ id: execution.id, key: "review-37", expectedRevision: 8, approved: false, output: notes }]);
	await f.render(<div />);
	await f.render(render());
	expect(f.button("Approve step").props.disabled).toBeTrue();
	expect(f.root.container.queryAll((node) => node.type === "textarea")[0]!.props.value).toBe(notes);
	expect(f.text()).toContain("Decision delivery unknown");
	await f.close();
});

test("a changed decision revision requires another preview", async () => {
	const f = fixture();
	const render = (view: FlowExecutionViewV1) => (
		<FlowDecisionDialog execution={view} actionKey="review-37" recoveryBlocked={false} onClose={() => {}} />
	);
	await f.render(render(execution));
	await f.render(render({ ...execution, revision: 9 }));
	expect(f.button("Approve step").props.disabled).toBeTrue();
	await act(async () => f.button("Review current step").props.onClick());
	expect(f.button("Approve step").props.disabled).toBeFalse();
	await f.close();
});

test("an unavailable recovery fence blocks V1 mutations", async () => {
	const f = fixture();
	f.queryClient.setQueryDefaults(["recovery"], { staleTime: Infinity });
	f.queryClient.setQueryData(["recovery"], { state: "unavailable", generation: null });
	await f.render(<FlowDecisionDialog execution={execution} actionKey="review-37" onClose={() => {}} />);
	expect(f.button("Approve step").props.disabled).toBeTrue();
	await f.close();
});

test("cancellation retains an unconfirmed worker stop", async () => {
	const f = fixture({ flowExecutionsV1: { cancel: async () => ({ ...stopPendingV1Example, revision: 9 }) } });
	await f.render(<FlowCancelDialog execution={execution} recoveryBlocked={false} onClose={() => {}} />);
	await act(async () => f.button("Cancel run").props.onClick());
	await flush();
	expect(f.text()).toContain("has not confirmed");
	expect(f.text()).not.toContain("All worker stops are confirmed");
	expect(f.button("Cancel run").props.disabled).toBeTrue();
	await f.close();
});

test("start refuses a changed head before the mutation", async () => {
	let starts = 0;
	const f = fixture({
		pullRequests: { refresh: async () => ({ url: "https://github.com/example/repo/pull/1", fetchError: null }) },
		reviews: { refresh: async () => ({ headSha: "b".repeat(40) }) },
		flowDocumentsV1: { get: async () => publishedDocumentV1Example },
		flowExecutionsV1: {
			start: async () => {
				starts += 1;
				return execution;
			},
		},
	});
	await f.render(
		<StartFlowDialog
			ticket="TRL-682"
			diffId="diff"
			headSha={"a".repeat(40)}
			recoveryBlocked={false}
			onClose={() => {}}
		/>,
	);
	await flush();
	await act(async () => f.button("Review target").props.onClick());
	await act(async () => f.button("Start flow").props.onClick());
	await flush();
	expect(starts).toBe(0);
	expect(f.text()).toContain("The diff head changed");
	expect(f.button("Start flow").props.disabled).toBeTrue();
	await f.close();
});

test("a replacement attempt detaches the terminal and reads only the retained target", async () => {
	const targets: unknown[] = [];
	const f = fixture({
		flowExecutionsV1: {
			output: async (target: unknown) => {
				targets.push(target);
				return { output: "retained text" };
			},
		},
	});
	const attempt = { ...occurrenceV1Example.attempts[0]!, resultId: "result" };
	const task = { key: "review-37", runId: attempt.agentRunId, attemptId: attempt.attemptId, resultId: null };
	f.queryClient.setQueryData(["agents"], { items: [{ id: task.runId, terminalId: task.attemptId }] });
	await f.render(
		<FlowTaskTerminal
			task={task}
			attempt={attempt}
			reviewedHead={"a".repeat(40)}
			executionId={execution.id}
			onClose={() => {}}
		/>,
	);
	await act(async () =>
		f.queryClient.setQueryData(["agents"], { items: [{ id: task.runId, terminalId: "replacement" }] }),
	);
	await flush();
	expect(f.text()).not.toContain("replacement");
	for (let tick = 0; tick < 50 && !f.text().includes("retained text"); tick += 1) await flush();
	expect(f.text()).toContain("retained text");
	expect(f.text()).toContain("Unknown");
	expect(targets).toEqual([
		{
			executionId: execution.id,
			stepId: attempt.stepId,
			agentRunId: task.runId,
			attemptId: task.attemptId,
			resultId: "result",
		},
	]);
	await f.close();
});

test("unsubmitted notes survive close and reopen", async () => {
	const f = fixture();
	const render = () => <FlowDecisionDialog execution={execution} actionKey="review-37" onClose={() => {}} />;
	await f.render(render());
	await act(async () =>
		f.root.container
			.queryAll((node) => node.type === "textarea")[0]!
			.props.onChange({ target: { value: "Keep my draft" } }),
	);
	await f.render(<div />);
	await f.render(render());
	expect(f.root.container.queryAll((node) => node.type === "textarea")[0]!.props.value).toBe("Keep my draft");
	await f.close();
});

test("a saved acknowledgement resolves an unknown decision without another call", async () => {
	let calls = 0;
	const f = fixture({
		flowExecutionsV1: {
			decision: async () => {
				calls += 1;
				throw new Error("Response lost");
			},
		},
	});
	const render = (view: FlowExecutionViewV1) => (
		<FlowDecisionDialog execution={view} actionKey="review-37" onClose={() => {}} />
	);
	await f.render(render(execution));
	await act(async () => f.button("Approve step").props.onClick());
	await flush();
	expect(f.text()).toContain("Decision delivery unknown");
	for (const state of ["recorded", "pending", "unknown"] as const) {
		await f.render(
			render({
				...execution,
				revision: 9,
				decisionDeliveries: [{ ...unknownDecisionV1Example, approved: true, state }],
			}),
		);
		expect(f.text()).toContain(`Decision approval: ${state}`);
		expect(f.button("Approve step").props.disabled).toBeTrue();
	}
	await f.render(
		render({
			...execution,
			revision: 10,
			decisionDeliveries: [
				{
					...unknownDecisionV1Example,
					approved: true,
					state: "confirmed",
					acceptedReceiptId: "receipt",
					confirmedAt: "2026-09-29T18:00:00.000Z",
				},
			],
		}),
	);
	expect(f.text()).toContain("Decision approval: confirmed");
	expect(f.button("Approve step").props.disabled).toBeTrue();
	expect(calls).toBe(1);
	await f.close();
});

test("an unfinished attempt cannot read output from another result", async () => {
	let reads = 0;
	const f = fixture({
		flowExecutionsV1: {
			output: async () => {
				reads += 1;
				return { output: "wrong" };
			},
		},
	});
	const attempt = { ...occurrenceV1Example.attempts[0]!, resultId: null };
	await f.render(
		<FlowTaskTerminal
			executionId={execution.id}
			task={{ key: "review-37", runId: attempt.agentRunId, attemptId: attempt.attemptId, resultId: null }}
			attempt={attempt}
			onClose={() => {}}
		/>,
	);
	await flush();
	expect(reads).toBe(0);
	expect(f.text()).toContain("Retained output for this exact attempt is unavailable");
	await f.close();
});

test("pending admission from another client blocks the selected flow", async () => {
	const f = fixture();
	await f.render(
		<StartFlowDialog
			ticket="TRL-682"
			diffId="diff"
			headSha={"a".repeat(40)}
			pendingFlowIds={[publishedDocumentV1Example.flow.id]}
			onClose={() => {}}
		/>,
	);
	await flush();
	expect(f.button("Review target").props.disabled).toBeTrue();
	expect(f.text()).toContain("Run admission is pending or unknown");
	await f.close();
});
