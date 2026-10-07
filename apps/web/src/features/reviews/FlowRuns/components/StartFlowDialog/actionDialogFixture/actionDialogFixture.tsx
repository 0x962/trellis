import { afterAll, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	executionViewV1Example,
	type FlowExecutionViewV1,
	occurrenceV1Example,
	publishedDocumentV1Example,
} from "@trellis/api";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../../lib/appContext";

mock.module("@tanstack/react-router", () => ({
	Link: ({ children }: { children?: ReactNode }) => <a href="/ai/flows">{children}</a>,
}));
mock.module("@trellis/ui", () => ({
	EmptyState: ({ title, description, action }: { title?: ReactNode; description?: ReactNode; action?: ReactNode }) => (
		<section>
			{title}
			{description}
			{action}
		</section>
	),
	PropertyRow: ({ label, children }: { label: string; children: ReactNode }) => (
		<div>
			<dt>{label}</dt>
			<dd>{children}</dd>
		</div>
	),
	FailureState: ({ title, detail }: { title: string; detail: string }) => (
		<section>
			{title}
			{detail}
		</section>
	),
	OutputBlock: ({ text }: { text: string }) => <pre>{text}</pre>,
	Dialog: ({ children }: { children: ReactNode }) => <section>{children}</section>,
	Button: ({ processing, ...props }: ComponentProps<"button"> & { processing?: boolean }) => (
		<button {...props} disabled={Boolean(props.disabled || processing)} aria-busy={processing || undefined} />
	),
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
mock.module("../../../../../agents/NativeTerminal", () => ({
	NativeTerminal: ({ run }: { run: { terminalId: string } }) => <pre>{run.terminalId}</pre>,
}));
export const { FlowDecisionDialog } = await import("../../FlowRun/components/FlowDecisionDialog");
export const { FlowCancelDialog } = await import("../../FlowRun/components/FlowCancelDialog");
export const { FlowTaskTerminal } = await import("../../FlowRun/components/FlowTaskTerminal");
export const { StartFlowDialog } = await import("../StartFlowDialog");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
export const execution: FlowExecutionViewV1 = {
	...executionViewV1Example,
	status: "waiting",
	detail: "waiting_human",
	occurrences: [{ ...occurrenceV1Example, state: "waiting_human", waitReason: "human" }],
};

export function fixture(client = {}) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const app = {
		queryClient,
		client,
		orpc: {
			flowExecutions: { list: { key: () => ["executions"] } },
			flowExecutionsV1: {
				recovery: {
					queryOptions: () => ({ queryKey: ["recovery"], queryFn: async () => ({ state: "open", generation: 1 }) }),
				},
			},
			flowDocumentsV1: {
				key: () => ["flow-v1"],
				get: { queryOptions: () => ({ queryKey: ["document"], queryFn: async () => publishedDocumentV1Example }) },
			},
			flows: {
				list: { queryOptions: () => ({ queryKey: ["flows"], queryFn: async () => [publishedDocumentV1Example.flow] }) },
			},
			pullRequests: {
				list: {
					queryOptions: () => ({
						queryKey: ["pull-requests"],
						queryFn: async () => [{ id: "diff", owner: "example", repo: "catalog", number: 12 }],
					}),
				},
			},
			agentRuns: { list: { queryOptions: () => ({ queryKey: ["agents"], queryFn: async () => ({ items: [] }) }) } },
		},
	} as unknown as AppContext;
	queryClient.setQueryData(["recovery"], { state: "open", generation: 1 });
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
		waitForEnabledButton: async (label: string) => {
			const deadline = performance.now() + 2_000;
			while (true) {
				const button = root.container.queryAll((node) => node.type === "button" && node.children.includes(label))[0];
				if (button?.props.disabled === false) return button;
				if (performance.now() >= deadline) throw new Error(`The ${label} button did not become enabled.`);
				await flush();
			}
		},
		text: () => JSON.stringify(root.container.toJSON()),
		close: async () => {
			await act(async () => root.unmount());
			queryClient.clear();
		},
	};
}
export const flush = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
	});
