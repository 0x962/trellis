import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import {
	type FlowExecutionDecisionInput,
	type FlowExecutionStartInput,
	publishedDocumentV1Example,
} from "@trellis/api";
import { act } from "react";
import { execution, fixture, FlowDecisionDialog, flush, StartFlowDialog } from "./actionDialogFixture";

const dialog = (blocked = false) => (
	<StartFlowDialog
		ticket="TRL-682"
		diffId="diff"
		headSha={"a".repeat(40)}
		recoveryBlocked={blocked}
		onClose={() => {}}
	/>
);

test("a failed preview permits a fresh confirmed start", async () => {
	let previews = 0;
	const sent: FlowExecutionStartInput[] = [];
	const f = fixture({
		pullRequests: {
			refresh: async () => {
				previews += 1;
				if (previews === 1) throw new Error("Preview unavailable");
				return { url: "https://github.com/example/repo/pull/1", fetchError: null };
			},
		},
		reviews: { refresh: async () => ({ headSha: "a".repeat(40) }) },
		flowDocumentsV1: { get: async () => publishedDocumentV1Example },
		flowExecutionsV1: {
			start: async (input: FlowExecutionStartInput) => {
				sent.push(input);
				return execution;
			},
		},
	});
	await f.render(dialog());
	await flush();
	await act(async () => f.button("Review target").props.onClick());
	await act(async () => f.button("Start flow").props.onClick());
	await flush();
	expect(sent).toEqual([]);
	expect(f.text()).toContain("No start request was sent");
	await act(async () => f.button("Refresh preview").props.onClick());
	await flush();
	await act(async () => f.button("Review target").props.onClick());
	await act(async () => f.button("Start flow").props.onClick());
	await flush();
	expect(sent).toHaveLength(1);
	expect(previews).toBe(2);
	await f.close();
});

test("unknown start replays its exact input after reopen and respects recovery", async () => {
	let previews = 0;
	const sent: FlowExecutionStartInput[] = [];
	const f = fixture({
		pullRequests: {
			refresh: async () => {
				previews += 1;
				return { url: "https://github.com/example/repo/pull/1", fetchError: null };
			},
		},
		reviews: { refresh: async () => ({ headSha: "a".repeat(40) }) },
		flowDocumentsV1: { get: async () => publishedDocumentV1Example },
		flowExecutionsV1: {
			start: async (input: FlowExecutionStartInput) => {
				sent.push(input);
				if (sent.length === 1) throw new Error("Lost response");
				if (sent.length === 2) throw new ORPCError("FLOW_ACTION_PENDING");
				return execution;
			},
		},
	});
	await f.render(dialog());
	await flush();
	await act(async () => f.button("Review target").props.onClick());
	await act(async () => f.button("Start flow").props.onClick());
	await flush();
	await f.render(<div />);
	await f.render(dialog(true));
	expect(f.button("Retry original request").props.disabled).toBeTrue();
	await act(async () => f.button("Retry original request").props.onClick());
	expect(sent).toHaveLength(1);
	await f.render(dialog());
	await act(async () => f.button("Retry original request").props.onClick());
	await flush();
	expect(f.text()).toContain("Start result unknown");
	expect(f.text()).not.toContain("Run available");
	await act(async () => f.button("Retry original request").props.onClick());
	await flush();
	expect(sent).toEqual([sent[0], sent[0], sent[0]]);
	expect(previews).toBe(1);
	expect(f.text()).toContain("The server can return an existing run");
	await f.close();
});

test("decision replay preserves rejection notes and the original action revision", async () => {
	const sent: FlowExecutionDecisionInput[] = [];
	const f = fixture({
		flowExecutionsV1: {
			decision: async (input: FlowExecutionDecisionInput) => {
				sent.push(input);
				throw new ORPCError("FLOW_ACTION_PENDING");
			},
		},
	});
	const render = (revision: number) => (
		<FlowDecisionDialog execution={{ ...execution, revision }} actionKey="review-37" onClose={() => {}} />
	);
	await f.render(render(8));
	await act(async () =>
		f.root.container
			.queryAll((node) => node.type === "textarea")[0]!
			.props.onChange({
				target: { value: "Reject this exact step" },
			}),
	);
	await act(async () => f.button("Reject step").props.onClick());
	await flush();
	await f.render(render(9));
	await act(async () => f.button("Retry original request").props.onClick());
	await flush();
	expect(sent).toEqual([
		{ id: execution.id, key: "review-37", expectedRevision: 8, output: "Reject this exact step", approved: false },
		{ id: execution.id, key: "review-37", expectedRevision: 8, output: "Reject this exact step", approved: false },
	]);
	expect(f.button("Approve step").props.disabled).toBeTrue();
	expect(f.root.container.queryAll((node) => node.type === "textarea")[0]!.props.value).toBe("Reject this exact step");
	await f.close();
});
