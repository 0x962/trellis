import { afterAll, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	executionViewV1Example,
	type FlowExecutionDecisionInput,
	type FlowExecutionViewV1,
	occurrenceV1Example,
	publishedDocumentV1Example,
	stopPendingV1Example,
} from "@trellis/api";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";

mock.module("@trellis/ui", () => ({
	Dialog: ({ children }: { children: ReactNode }) => <section>{children}</section>,
	Button: (props: ComponentProps<"button">) => <button {...props} />,
	IconButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
		<button type="button" onClick={onClick}>
			{label}
		</button>
	),
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
	Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
	Select: () => <select />,
	FlowDecisionContext: () => <section />,
}));
mock.module("../../../../agents/NativeTerminal", () => ({
	NativeTerminal: ({ run }: { run: { terminalId: string } }) => <pre>{run.terminalId}</pre>,
}));
const { FlowDecisionDialog } = await import("../FlowRun/components/FlowDecisionDialog");
const { FlowCancelDialog } = await import("../FlowRun/components/FlowCancelDialog");
const { FlowTaskTerminal } = await import("../FlowRun/components/FlowTaskTerminal");
const { StartFlowDialog } = await import("./StartFlowDialog");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const execution: FlowExecutionViewV1 = {
	...executionViewV1Example,
	status: "waiting",
	detail: "waiting_human",
	occurrences: [{ ...occurrenceV1Example, state: "waiting_human", waitReason: "human" }],
};

function fixture(client = {}) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const app = {
		queryClient,
		client,
		orpc: {
			flowExecutions: { list: { key: () => ["executions"] } },
			flows: {
				list: { queryOptions: () => ({ queryKey: ["flows"], queryFn: async () => [publishedDocumentV1Example.flow] }) },
			},
			agentRuns: { list: { queryOptions: () => ({ queryKey: ["agents"], queryFn: async () => ({ items: [] }) }) } },
		},
	} as unknown as AppContext;
	const root = createRoot();
	return {
		root,
		queryClient,
		render: (element: ReactNode) =>
			act(async () => {
				root.render(
					<QueryClientProvider client={queryClient}>
						<AppProvider value={app}>{element}</AppProvider>
					</QueryClientProvider>,
				);
			}),
		button: (label: string) =>
			root.container.queryAll((node) => node.type === "button" && node.children.includes(label))[0]!,
		text: () => JSON.stringify(root.container.toJSON()),
		close: async () => {
			await act(async () => root.unmount());
			queryClient.clear();
		},
	};
}
const flush = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
	});

test("notes have no implicit approval and rejection uses the displayed revision", async () => {
	const calls: FlowExecutionDecisionInput[] = [];
	const f = fixture();
	const render = () => (
		<FlowDecisionDialog
			execution={execution}
			actionKey="review-37"
			recoveryBlocked={false}
			onDecideV1={async (input) => {
				calls.push(input);
				throw new Error("Lost acknowledgement");
			}}
			onClose={() => {}}
		/>
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
		<FlowDecisionDialog
			execution={view}
			actionKey="review-37"
			recoveryBlocked={false}
			onDecideV1={async () => execution}
			onClose={() => {}}
		/>
	);
	await f.render(render(execution));
	await f.render(render({ ...execution, revision: 9 }));
	expect(f.button("Approve step").props.disabled).toBeTrue();
	await act(async () => f.button("Review current step").props.onClick());
	expect(f.button("Approve step").props.disabled).toBeFalse();
	await f.close();
});

test("a missing recovery fence blocks V1 mutations even with a callback", async () => {
	const f = fixture();
	await f.render(
		<FlowDecisionDialog
			execution={execution}
			actionKey="review-37"
			onDecideV1={async () => execution}
			onClose={() => {}}
		/>,
	);
	expect(f.button("Approve step").props.disabled).toBeTrue();
	await f.close();
});

test("cancellation retains an unconfirmed worker stop", async () => {
	const f = fixture();
	await f.render(
		<FlowCancelDialog
			execution={execution}
			recoveryBlocked={false}
			onCancelV1={async () => ({ ...stopPendingV1Example, revision: 9 })}
			onClose={() => {}}
		/>,
	);
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
		pullRequests: { refresh: async () => ({ headSha: "b".repeat(40), fetchError: null }) },
		flows: { get: async () => ({ flow: publishedDocumentV1Example.flow }) },
		flowExecutions: {
			start: async () => {
				starts += 1;
				return execution;
			},
		},
	});
	await f.render(<StartFlowDialog ticket="TRL-682" diffId="diff" headSha={"a".repeat(40)} onClose={() => {}} />);
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
	const f = fixture();
	const attempt = occurrenceV1Example.attempts[0]!;
	const task = { key: "review-37", runId: attempt.agentRunId, attemptId: attempt.attemptId, resultId: null };
	f.queryClient.setQueryData(["agents"], { items: [{ id: task.runId, terminalId: task.attemptId }] });
	const targets: unknown[] = [];
	await f.render(
		<FlowTaskTerminal
			task={task}
			attempt={attempt}
			reviewedHead={"a".repeat(40)}
			readRetainedOutput={async (target) => {
				targets.push(target);
				return "retained text";
			}}
			onClose={() => {}}
		/>,
	);
	await act(async () =>
		f.queryClient.setQueryData(["agents"], { items: [{ id: task.runId, terminalId: "replacement" }] }),
	);
	await flush();
	expect(f.text()).not.toContain("replacement");
	expect(f.text()).toContain("retained text");
	expect(f.text()).toContain("Unknown");
	expect(targets).toEqual([{ runId: task.runId, attemptId: task.attemptId, resultId: null }]);
	await f.close();
});
