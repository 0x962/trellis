import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	AgentBroadcastCounts,
	AgentBroadcastInput,
	AgentBroadcastRecipientsInput,
	AgentBroadcastResult,
} from "@trellis/api";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";

type ComposerProps = ComponentProps<typeof import("@trellis/ui").BroadcastComposer>;
mock.module("@trellis/ui", () => ({
	BroadcastComposer: ({ children, description, footer, onSubmit }: ComposerProps) => (
		<section>
			<p>{description}</p>
			<form onSubmit={() => onSubmit()}>
				{children}
				{footer}
			</form>
		</section>
	),
	Button: ({ processing: _processing, ...props }: ComponentProps<"button"> & { processing?: boolean }) => (
		<button {...props} />
	),
	Checkbox: ({
		label,
		checked,
		onCheckedChange,
		disabled,
	}: {
		label: string;
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
		disabled: boolean;
	}) => (
		<input
			type="checkbox"
			aria-label={label}
			checked={checked}
			onChange={(event) => onCheckedChange(event.target.checked)}
			disabled={disabled}
		/>
	),
	FieldHint: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	Textarea: ({ label: _label, ...props }: ComponentProps<"textarea"> & { label: string }) => <textarea {...props} />,
	FailureState: ({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) => (
		<div>
			<p>{title}</p>
			<details>
				<summary>Details</summary>
				{detail}
			</details>
			{action}
		</div>
	),
}));

const { BroadcastDialog } = await import("./BroadcastDialog");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of cleanups.splice(0)) await close();
});

async function fixture(
	send: (input: AgentBroadcastInput) => Promise<AgentBroadcastResult>,
	counts: AgentBroadcastCounts | "pending" | "error" = { working: 2, idle: 1 },
	epic?: { ref: string; name: string },
) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	const scopes: AgentBroadcastRecipientsInput[] = [];
	const queryKey = ["broadcast-counts", epic ? { epic: epic.ref } : {}];
	if (typeof counts === "object") queryClient.setQueryData(queryKey, counts);
	const app = {
		client: { agentRuns: { broadcast: send } },
		orpc: {
			agentRuns: {
				broadcastRecipients: {
					queryOptions: ({ input }: { input: AgentBroadcastRecipientsInput }) => {
						scopes.push(input);
						return {
							queryKey: ["broadcast-counts", input],
							queryFn: async () => {
								if (counts === "pending") return new Promise<AgentBroadcastCounts>(() => {});
								if (counts === "error") throw new Error("Count unavailable");
								return counts;
							},
						};
					},
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
					<BroadcastDialog epic={epic} onClose={() => {}} />
				</AppProvider>
			</QueryClientProvider>,
		);
	});
	const node = (type: string) => root.container.queryAll((node) => node.type === type)[0]!;
	const sendButton = () =>
		root.container.queryAll((node) => node.type === "button" && node.props.type === "submit")[0]!;
	const checkbox = (group: "Working" | "Idle") =>
		root.container.queryAll((node) => node.type === "input" && node.props["aria-label"].startsWith(group))[0]!;
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
		scopes,
		settle,
		text: () => JSON.stringify(root.container.toJSON(), (key, value) => (key === "ref" ? undefined : value)),
		input: (text: string) => act(async () => node("textarea").props.onChange({ target: { value: text } })),
		check: (group: "Working" | "Idle", checked: boolean) =>
			act(async () => checkbox(group).props.onChange({ target: { checked } })),
		checked: (group: "Working" | "Idle") => checkbox(group).props.checked,
		counts: (next: AgentBroadcastCounts) =>
			act(async () => {
				counts = next;
				queryClient.setQueryData(queryKey, next);
				await settle();
			}),
		submit: async () => {
			await act(async () => node("form").props.onSubmit({ preventDefault() {} }));
			await settle();
		},
		sendDisabled: () => sendButton().props.disabled,
		sendLabel: () => sendButton().children.join(""),
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
	expect(calls[0]?.epic).toBeUndefined();
	expect(f.scopes.every((scope) => scope.epic === undefined)).toBe(true);
	expect(f.text()).toContain("Trellis accepted ");
});

test.each(["working", "idle", "both"] as const)(
	"the epic dialog applies its scope to %s counts and delivery",
	async (group) => {
		const calls: AgentBroadcastInput[] = [];
		const f = await fixture(
			async (input) => {
				calls.push(input);
				return { group: input.group, recipientCount: 1, acceptedCount: 1, failures: [] };
			},
			undefined,
			{ ref: "TRL/release", name: "Release" },
		);
		expect(f.text()).toContain("Send one message to the selected groups in Release.");
		await f.input("Epic direction");
		await f.check("Working", group !== "idle");
		await f.check("Idle", group !== "working");
		await f.submit();
		expect(calls[0]).toMatchObject({ epic: "TRL/release", group, text: "Epic direction" });
		expect(f.scopes.every((scope) => scope.epic === "TRL/release")).toBe(true);
	},
);

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
	await f.check("Idle", true);
	await f.submit();
	expect(calls[3]?.requestId).not.toBe(calls[2]?.requestId);
	expect(calls[3]?.group).toBe("both");
	await f.check("Working", false);
	await f.submit();
	expect(calls[4]?.requestId).not.toBe(calls[3]?.requestId);
	expect(calls[4]?.group).toBe("idle");
});

test("checkboxes select either group or both and the Send button counts their recipients", async () => {
	const calls: AgentBroadcastInput[] = [];
	const f = await fixture(async (input) => {
		calls.push(input);
		return { group: input.group, recipientCount: 3, acceptedCount: 3, failures: [] };
	});
	await f.input("One broadcast");
	expect(f.checked("Working")).toBe(true);
	expect(f.checked("Idle")).toBe(false);
	expect(f.sendLabel()).toBe("Send to 2 agents");
	await f.check("Working", false);
	expect(f.sendLabel()).toBe("Send to 0 agents");
	expect(f.sendDisabled()).toBe(true);
	expect(f.text()).toContain("Select at least one group.");
	await f.submit();
	expect(calls).toEqual([]);
	await f.check("Idle", true);
	expect(f.sendLabel()).toBe("Send to 1 agent");
	expect(f.sendDisabled()).toBe(false);
	await f.check("Working", true);
	expect(f.checked("Idle")).toBe(true);
	expect(f.sendLabel()).toBe("Send to 3 agents");
	await f.submit();
	expect(calls).toEqual([{ group: "both", text: "One broadcast", requestId: expect.any(String) }]);
});

test("the Send count follows refreshed counts and blocks an empty selection", async () => {
	const f = await fixture(async () => {
		throw new Error("No delivery expected");
	});
	await f.input("Current recipients");
	await f.check("Idle", true);
	await f.counts({ working: 4, idle: 2 });
	expect(f.sendLabel()).toBe("Send to 6 agents");
	await f.counts({ working: 0, idle: 0 });
	expect(f.sendLabel()).toBe("Send to 0 agents");
	expect(f.sendDisabled()).toBe(true);
});

test.each(["pending", "error"] as const)(
	"an unavailable count (%s) blocks Send without a false count",
	async (counts) => {
		const calls: AgentBroadcastInput[] = [];
		const f = await fixture(async (input) => {
			calls.push(input);
			throw new Error("No delivery expected");
		}, counts);
		await f.input("Wait for the count");
		await f.settle();
		expect(f.sendLabel()).toBe("Send");
		expect(f.sendDisabled()).toBe(true);
		await f.submit();
		expect(calls).toEqual([]);
	},
);

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
	await f.submit();
	expect(calls).toBe(1);
});
