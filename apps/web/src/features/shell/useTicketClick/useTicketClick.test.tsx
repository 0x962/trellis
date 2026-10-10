import { afterEach, beforeEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import type { AgentRun } from "@trellis/api";
import { Window } from "happy-dom";
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useSessionClickKey } from "../../../hooks/useSessionClickKey";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { pageSheetActions, usePageSheetStore } from "../../../stores/pageSheetStore";
import { cardKeyDown } from "../../board/Board/utils/cardKeyDown";
import { type TableController, useTableHotkeys } from "../../table/hooks/useTableHotkeys";
import { LinkCapture } from "../LinkCapture";
import { TicketLink } from "../TicketLink";
import { useTicketClick } from "./useTicketClick";

const globals = new Map<string, PropertyDescriptor | undefined>();
let browser: Window;
let root: ReturnType<typeof createRoot>;
let queryClient: QueryClient;
let runs: AgentRun[];
let requests: string[];
let statuses: number;
let readRuns: () => Promise<AgentRun[]>;
const run = (fields: Partial<AgentRun> = {}) =>
	({
		id: "agent",
		name: "Agent",
		kind: "agent",
		ticketId: "ticket",
		ticketIdentifier: "TRL-1610",
		assigned: true,
		processStatus: "running",
		createdAt: "2026-10-10T12:00:00Z",
		observation: null,
		...fields,
	}) as AgentRun;

beforeEach(async () => {
	browser = new Window({ url: "http://localhost" });
	runs = [run()];
	requests = [];
	readRuns = async () => runs;
	statuses = 0;
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	for (const [name, value] of Object.entries({
		window: browser,
		location: browser.location,
		document: browser.document,
		HTMLElement: browser.HTMLElement,
		Element: browser.Element,
		KeyboardEvent: browser.KeyboardEvent,
		MouseEvent: browser.MouseEvent,
		Event: browser.Event,
		IS_REACT_ACT_ENVIRONMENT: true,
	})) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
	}
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	function Tickets() {
		const onClick = useTicketClick();
		const { defer } = useSessionClickKey();
		const table = useRef<HTMLDivElement>(null);
		useTableHotkeys({
			root: table,
			focusedId: "ticket",
			editing: null,
			selection: { count: 0 },
			openField: () => statuses++,
		} as unknown as TableController);
		const boardKey = cardKeyDown({
			cardsOf: () => [],
			selection: { count: 0 },
			deferStatus: defer,
			chooseStatus: () => statuses++,
		} as unknown as Parameters<typeof cardKeyDown>[0]);
		return (
			<>
				<LinkCapture />
				<input aria-label="Search" />
				<a href="/t/TRL-1612" data-markdown="">
					Markdown ticket
				</a>
				<div ref={table}>
					<button type="button" onClick={(event) => onClick("TRL-1610", event)}>
						Ticket row
					</button>
				</div>
				<button
					type="button"
					data-board=""
					onKeyDown={(event) => boardKey(event, {} as never, {} as never)}
					onClick={(event) => onClick("TRL-1610", event)}
				>
					Board card
				</button>
				<TicketLink identifier="TRL-1611">Ticket link</TicketLink>
			</>
		);
	}
	const app = {
		queryClient,
		orpc: {
			agentRuns: {
				list: { queryOptions: ({ input }: { input: { ticket: string } }) => ({ queryKey: ["runs", input] }) },
			},
		},
		client: {
			agentRuns: {
				list: async ({ ticket }: { ticket: string }) => {
					requests.push(ticket);
					return { items: await readRuns(), nextCursor: null };
				},
			},
		},
	} as unknown as AppContext;
	pageSheetActions.closeTicket();
	const route = createRootRoute();
	const router = createRouter({
		routeTree: route.addChildren([createRoute({ getParentRoute: () => route, path: "$" })]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await act(async () =>
		root.render(
			<RouterContextProvider router={router}>
				<AppProvider value={app}>
					<Tickets />
				</AppProvider>
			</RouterContextProvider>,
		),
	);
});

afterEach(async () => {
	await act(async () => root.unmount());
	queryClient.clear();
	pageSheetActions.closeTicket();
	await browser.happyDOM.abort();
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	globals.clear();
});

function key(type: "keydown" | "keyup", options: KeyboardEventInit = {}, target: EventTarget = document) {
	target.dispatchEvent(new KeyboardEvent(type, { key: "s", code: "KeyS", bubbles: true, ...options }));
}
async function click(selector = "button", options: MouseEventInit = {}) {
	await act(async () => {
		document
			.querySelector(selector === "a" ? "a:not([data-markdown])" : selector)!
			.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...options }));
	});
}

test("S-click opens an existing session and cancels the status picker", async () => {
	key("keydown");
	expect(statuses).toBe(0);
	await click();
	key("keyup");
	expect(requests).toEqual(["TRL-1610"]);
	expect(usePageSheetStore.getState().session).toBe("agent");
	expect(usePageSheetStore.getState().ticket).toBeNull();
	expect(statuses).toBe(0);
});

test.each(["a", "[data-markdown]"])("ticket link %s opens the session", async (selector) => {
	key("keydown");
	await click(selector);
	expect(usePageSheetStore.getState().session).toBe("agent");
});

test("S alone opens status on release, once despite key repeats", async () => {
	key("keydown");
	key("keydown", { repeat: true });
	expect(statuses).toBe(0);
	key("keyup");
	expect(statuses).toBe(1);
	await click();
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1610");
	expect(requests).toEqual([]);
});

test("a ticket without an agent session opens its ticket", async () => {
	runs = [run({ kind: "flow" })];
	key("keydown");
	await click();
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1610");
	expect(usePageSheetStore.getState().session).toBeNull();
});

test("the assigned agent wins over a newer previous session", async () => {
	runs = [run({ id: "previous", assigned: false, createdAt: "2026-10-10T14:00:00Z" }), run()];
	key("keydown");
	await click();
	expect(usePageSheetStore.getState().session).toBe("agent");
});

test("the most recent retained session opens when no agent is assigned", async () => {
	runs = [
		run({ id: "older", assigned: false }),
		run({ id: "newer", assigned: false, createdAt: "2026-10-10T14:00:00Z" }),
	];
	key("keydown");
	await click();
	expect(usePageSheetStore.getState().session).toBe("newer");
});

test("text entry, composition and modified keys do not arm S-click", async () => {
	key("keydown", {}, document.querySelector("input")!);
	await click();
	for (const options of [
		{ isComposing: true },
		{ metaKey: true },
		{ ctrlKey: true },
		{ altKey: true },
		{ shiftKey: true },
	]) {
		key("keydown", options);
		await click();
	}
	expect(requests).toEqual([]);
	expect(statuses).toBe(0);
});

test("window blur cancels the status action and held key", async () => {
	key("keydown");
	window.dispatchEvent(new Event("blur"));
	key("keyup");
	await click();
	expect(requests).toEqual([]);
	expect(statuses).toBe(0);
});

test("modified ticket links retain browser behavior with S held", async () => {
	key("keydown");
	for (const options of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { button: 1 }])
		await click("a", options);
	expect(requests).toEqual([]);
	expect(usePageSheetStore.getState().session).toBeNull();
});

test("the board status key waits for release and S-click cancels it", async () => {
	const card = document.querySelector<HTMLButtonElement>("[data-board]")!;
	card.focus();
	key("keydown", {}, card);
	expect(statuses).toBe(0);
	key("keyup", {}, card);
	expect(statuses).toBe(1);
	key("keydown", {}, card);
	await click("[data-board]");
	key("keyup", {}, card);
	expect(statuses).toBe(1);
	expect(usePageSheetStore.getState().session).toBe("agent");
});

test("a slow S-click cannot replace a later ordinary ticket click", async () => {
	let resolve!: (runs: AgentRun[]) => void;
	readRuns = () =>
		new Promise((done) => {
			resolve = done;
		});
	key("keydown");
	await click();
	key("keyup");
	await click("a");
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1611");
	await act(async () => resolve([run()]));
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1611");
	expect(usePageSheetStore.getState().session).toBeNull();
});

test("the latest S-click wins when responses arrive in reverse order", async () => {
	const replies: ((runs: AgentRun[]) => void)[] = [];
	readRuns = () =>
		new Promise((done) => {
			replies.push(done);
		});
	key("keydown");
	await click();
	await click("a");
	await act(async () => replies[1]!([run({ id: "second" })]));
	expect(usePageSheetStore.getState().session).toBe("second");
	await act(async () => replies[0]!([run({ id: "first" })]));
	expect(usePageSheetStore.getState().session).toBe("second");
});
