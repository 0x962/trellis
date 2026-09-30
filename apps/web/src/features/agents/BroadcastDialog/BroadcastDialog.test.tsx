import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentBroadcastInput, AgentBroadcastResult } from "@trellis/api";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";

mock.module("@trellis/ui", () => ({
	Dialog: ({ children }: { children: ReactNode }) => <section>{children}</section>,
	Button: ({ processing: _processing, ...props }: ComponentProps<"button"> & { processing?: boolean }) => (
		<button {...props} />
	),
	ChoiceGroup: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => (
		<select value={value} onChange={(event) => onValueChange(event.target.value)} />
	),
	Textarea: ({ label: _label, ...props }: ComponentProps<"textarea"> & { label: string }) => <textarea {...props} />,
	FailureState: ({ title }: { title: string }) => <p>{title}</p>,
}));

const { BroadcastDialog } = await import("./BroadcastDialog");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of cleanups.splice(0)) await close();
});

async function fixture(send: (input: AgentBroadcastInput) => Promise<AgentBroadcastResult>) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	queryClient.setQueryData(["broadcast-counts"], { working: 2, idle: 1 });
	const app = {
		client: { agentRuns: { broadcast: send } },
		orpc: {
			agentRuns: {
				broadcastRecipients: {
					queryOptions: () => ({
						queryKey: ["broadcast-counts"],
						queryFn: async () => ({ working: 2, idle: 1 }),
					}),
				},
			},
		},
		queryClient,
	} as unknown as AppContext;
	const root = createRoot();
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<BroadcastDialog onClose={() => {}} />
				</AppProvider>
			</QueryClientProvider>,
		);
	});
	const node = (type: string) => root.container.queryAll((node) => node.type === type)[0]!;
	Object.assign(node("div").props.ref.current, { focus() {} });
	const settle = () =>
		act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	cleanups.push(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
	});
	return {
		settle,
		text: () => JSON.stringify(root.container.toJSON(), (key, value) => (key === "ref" ? undefined : value)),
		input: (text: string) => act(async () => node("textarea").props.onChange({ target: { value: text } })),
		group: (group: string) => act(async () => node("select").props.onChange({ target: { value: group } })),
		submit: async () => {
			await act(async () => node("form").props.onSubmit({ preventDefault() {} }));
			await settle();
		},
		sendDisabled: () =>
			root.container.queryAll((node) => node.type === "button" && node.children.includes("Send"))[0]!.props.disabled,
	};
}

test("the dialog keeps exact text and rejects a blank message", async () => {
	const calls: AgentBroadcastInput[] = [];
	const f = await fixture(async (input) => {
		calls.push(input);
		return { group: input.group, recipientCount: 2, acceptedCount: 2, failures: [] };
	});
	await f.input(" \t\n");
	expect(f.sendDisabled()).toBe(true);
	await f.submit();
	expect(calls).toEqual([]);
	const text = "  Keep the indentation\n\tNext line 文\n\n";
	await f.input(text);
	expect(f.sendDisabled()).toBe(false);
	await f.submit();
	expect(calls[0]?.text).toBe(text);
	expect(f.text()).toContain("Trellis accepted ");
});

test("an exact retry keeps its request ID while edited text or group gets a new ID", async () => {
	const calls: AgentBroadcastInput[] = [];
	const f = await fixture(async (input) => {
		calls.push(input);
		throw new Error("Response lost");
	});
	await f.input("Original message");
	await f.submit();
	await f.submit();
	expect(calls[1]).toEqual(calls[0]);
	await f.input("Changed message");
	await f.submit();
	expect(calls[2]?.requestId).not.toBe(calls[0]?.requestId);
	await f.group("idle");
	await f.submit();
	expect(calls[3]?.requestId).not.toBe(calls[2]?.requestId);
	expect(calls[3]?.group).toBe("idle");
});

test("the dialog blocks a pending send and displays partial delivery with the actual count", async () => {
	let finish!: (result: AgentBroadcastResult) => void;
	let calls = 0;
	const f = await fixture(async () => {
		calls++;
		return new Promise((resolve) => {
			finish = resolve;
		});
	});
	await f.input("Send this once");
	await f.submit();
	expect(f.sendDisabled()).toBe(true);
	await f.submit();
	expect(calls).toBe(1);
	await act(async () =>
		finish({
			group: "working",
			recipientCount: 3,
			acceptedCount: 2,
			failures: [
				{
					recipient: {
						id: "01M3R1SZJNST409SY5P61KTNE1",
						name: "Busy recipient",
						kind: "agent",
						projectKey: "TEST",
						ticketIdentifier: "TEST-1",
					},
					reason: "The process stops.",
				},
			],
		}),
	);
	await f.settle();
	const text = f.text();
	expect(text).toContain("The recipient group changed from ");
	expect(text).toContain("Busy recipient (TEST-1)");
	expect(text).toContain("The process stops.");
});
