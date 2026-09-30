import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewRevision } from "@trellis/api";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";

const notices: string[] = [];
mock.module("@trellis/ui", () => ({
	Dialog: ({ children, title, description }: { children: ReactNode; title: string; description: string }) => (
		<section aria-label={title}>
			<p>{description}</p>
			{children}
		</section>
	),
	ConfirmDialog: () => null,
	Button: ({ processing, ...props }: ComponentProps<"button"> & { processing?: boolean }) => (
		<button {...props} disabled={props.disabled || processing} />
	),
	Checkbox: ({
		label,
		checked,
		onCheckedChange,
		disabled,
	}: {
		label: string;
		checked: boolean;
		onCheckedChange: (value: boolean) => void;
		disabled: boolean;
	}) => (
		<input
			aria-label={label}
			type="checkbox"
			checked={checked}
			disabled={disabled}
			onChange={(event) => onCheckedChange(event.target.checked)}
		/>
	),
	FieldHint: ({ tone: _tone, ...props }: ComponentProps<"p"> & { tone?: string }) => <p {...props} />,
	GithubMark: () => null,
	IconButton: () => null,
	Menu: ({
		items,
	}: {
		items: Array<{ items: Array<{ label: string; disabled?: boolean; onSelect: () => void }> }>;
	}) => (
		<nav>
			{items
				.flatMap((group) => group.items)
				.map((item) => (
					<button type="button" key={item.label} disabled={item.disabled} onClick={item.onSelect}>
						{item.label}
					</button>
				))}
		</nav>
	),
	toast: { warning: (message: string) => notices.push(message), error: (message: string) => notices.push(message) },
}));
const { ReviewHeaderActions } = await import("./ReviewHeaderActions");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of cleanups.splice(0)) await close();
	notices.length = 0;
});
type Input = { pr: string; headSha: string; action: string; completeTicketIds?: string[] };
type Result = { state: string; completedTicketIds: string[] };
const ticket = { id: "ticket-1", identifier: "TRL-1", title: "One ticket" };
const url = "https://github.com/acme/app/pull/1";
const flush = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
	});

async function fixture(
	tickets: Array<typeof ticket> | "pending" | "error" = [ticket],
	send: (input: Input) => Promise<Result> = async (input) => ({
		state: "merged",
		completedTicketIds: input.completeTicketIds ?? [],
	}),
) {
	const calls: Input[] = [];
	let done = 0;
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	const app = {
		client: {
			reviews: {
				action: async (input: Input) => {
					calls.push(input);
					return send(input);
				},
			},
		},
		orpc: {
			reviews: {
				metadata: {
					key: () => ["metadata"],
					queryOptions: () => ({ queryKey: ["metadata"], queryFn: async () => ({}) }),
				},
				mergeTickets: {
					key: () => ["merge-tickets"],
					queryOptions: () => ({
						queryKey: ["merge-tickets"],
						queryFn: async () => {
							if (tickets === "pending") return new Promise<Array<typeof ticket>>(() => {});
							if (tickets === "error") throw new Error("Cannot load tickets");
							return tickets;
						},
					}),
				},
			},
		},
		queryClient,
	} as unknown as AppContext;
	const root = createRoot();
	const revision = { headSha: "reviewed-head", meta: { state: "OPEN" } } as unknown as ReviewRevision;
	await act(async () =>
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<ReviewHeaderActions
						pr={url}
						revision={revision}
						onDone={() => {
							done++;
						}}
					/>
				</AppProvider>
			</QueryClientProvider>,
		),
	);
	const buttons = (label: string) =>
		root.container.queryAll((node) => node.type === "button" && node.children.join("") === label);
	await act(async () => buttons("Merge")[0]!.props.onClick());
	await flush();
	cleanups.push(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
	});
	return {
		calls,
		done: () => done,
		buttons,
		click: async (label: string) => {
			await act(async () => buttons(label).at(-1)!.props.onClick());
			await flush();
		},
		admin: () =>
			act(async () =>
				root.container.queryAll((node) => node.type === "input")[0]!.props.onChange({ target: { checked: true } }),
			),
		text: () => JSON.stringify(root.container.toJSON()),
	};
}

test("the last PR offers both choices and plain Merge selects no tickets", async () => {
	const f = await fixture();
	expect(f.buttons("Merge and mark done")).toHaveLength(1);
	expect(f.text()).toContain("also completes TRL-1");
	await f.click("Merge");
	expect(f.calls).toEqual([{ pr: url, headSha: "reviewed-head", action: "merge", completeTicketIds: [] }]);
	expect(f.done()).toBe(1);
});

test("Merge and mark done selects exactly the displayed tickets", async () => {
	const f = await fixture([ticket, { ...ticket, id: "ticket-2", identifier: "TRL-2" }]);
	expect(f.text()).toContain("TRL-1, TRL-2");
	await f.click("Merge and mark done");
	expect(f.calls).toEqual([
		{ pr: url, headSha: "reviewed-head", action: "merge", completeTicketIds: ["ticket-1", "ticket-2"] },
	]);
});

test.each(["Merge", "Merge and mark done"])("Admin merge preserves the %s choice", async (label) => {
	const f = await fixture();
	await f.admin();
	await f.click(label);
	expect(f.calls[0]).toMatchObject({ action: "admin-merge", completeTicketIds: label === "Merge" ? [] : ["ticket-1"] });
});

test("a PR with no eligible ticket offers only Merge", async () => {
	const f = await fixture([]);
	expect(f.buttons("Merge and mark done")).toHaveLength(0);
	await f.click("Merge");
	expect(f.calls[0]?.completeTicketIds).toEqual([]);
});

test("loading keeps merge disabled until the ticket choice is known", async () => {
	const f = await fixture("pending");
	expect(f.buttons("Merge").at(-1)!.props.disabled).toBe(true);
	expect(f.buttons("Merge and mark done")).toHaveLength(0);
	expect(f.text()).toContain("Checking linked tickets");
	expect(f.calls).toEqual([]);
});

test("a ticket query error exposes only plain Merge with an error message", async () => {
	const f = await fixture("error");
	expect(f.buttons("Merge and mark done")).toHaveLength(0);
	expect(f.text()).toContain("Cannot load linked tickets");
	await f.click("Merge");
	expect(f.calls[0]?.completeTicketIds).toEqual([]);
});

test("a pending merge disables both choices and Cancel", async () => {
	const pending = Promise.withResolvers<Result>();
	const f = await fixture([ticket], () => pending.promise);
	await f.click("Merge and mark done");
	for (const label of ["Merge", "Merge and mark done", "Cancel"])
		expect(f.buttons(label).at(-1)!.props.disabled).toBe(true);
	pending.resolve({ state: "merged", completedTicketIds: [ticket.id] });
	await flush();
	expect(f.done()).toBe(1);
});

test("a refused completion reports the incomplete result", async () => {
	const f = await fixture([ticket], async () => ({ state: "merged", completedTicketIds: [] }));
	await f.click("Merge and mark done");
	expect(notices).toContain("Some tickets remain open");
});
