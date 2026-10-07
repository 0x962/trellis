import { afterAll, afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import type { ReactNode } from "react";
import { type AppContext, AppProvider } from "../../../lib/appContext";

const browser = new Window({ url: "http://localhost:5174" });
const saved = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"HTMLInputElement",
	"Element",
	"Node",
	"DocumentFragment",
	"MutationObserver",
	"ResizeObserver",
	"NodeFilter",
	"getComputedStyle",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"CustomEvent",
	"Event",
	"KeyboardEvent",
	"MouseEvent",
	"PointerEvent",
]) {
	saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	const value = name === "window" ? browser : Reflect.get(browser, name);
	Object.defineProperty(globalThis, name, {
		configurable: true,
		writable: true,
		value: ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"].includes(name)
			? value.bind(browser)
			: value,
	});
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
browser.HTMLElement.prototype.scrollIntoView = () => {};
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { EpicPicker } = await import("../EpicPicker");
const { WavePicker } = await import("../WavePicker");
const { LabelPicker } = await import("../LabelPicker");
const { TicketPicker } = await import("../TicketPicker");
const disposals: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const dispose of disposals.splice(0)) await dispose();
});
afterAll(async () => {
	await browser.happyDOM.abort();
	for (const [name, value] of saved) {
		if (value) Object.defineProperty(globalThis, name, value);
		else Reflect.deleteProperty(globalThis, name);
	}
});

const wait = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 40));
	});
async function fixture(kind: "epic" | "wave" | "label" | "ticket", cached = false) {
	let failed = true;
	let calls = 0;
	const picked: unknown[] = [];
	const item = { id: "one", ref: "PR/plan/one", name: "First wave", state: "open", slug: "one" };
	const data =
		kind === "epic"
			? [{ ...item, ref: "PR/plan", name: "Plan" }]
			: kind === "wave"
				? { waves: [item] }
				: kind === "label"
					? { labels: [{ id: "label", name: "Existing label", color: "blue", groupId: null }], groups: [] }
					: { tickets: [{ id: "ticket", identifier: "PR-1", title: "Parent ticket", status: { category: "todo" } }] };
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	const query = {
		queryOptions: () => ({
			queryKey: [kind],
			queryFn: async () => {
				calls++;
				if (failed) throw new Error("Network unavailable");
				return data;
			},
		}),
	};
	if (cached) queryClient.setQueryData([kind], data);
	const app = {
		orpc: { epics: { list: query, get: query }, labels: { list: query }, search: { query } },
		queryClient,
	} as unknown as AppContext;
	const props = { trigger: <button type="button">Open picker</button>, open: true, allowNone: false };
	let child: ReactNode;
	if (kind === "epic") child = <EpicPicker {...props} project="PR" onPick={(value) => picked.push(value)} />;
	else if (kind === "wave") child = <WavePicker {...props} epic="PR/plan" onPick={(value) => picked.push(value)} />;
	else if (kind === "label")
		child = <LabelPicker {...props} project="PR" checked={[]} onToggle={(value) => picked.push(value)} />;
	else child = <TicketPicker {...props} project="PR" onPick={(value) => picked.push(value)} />;
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () =>
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>{child}</AppProvider>
			</QueryClientProvider>,
		),
	);
	if (kind === "ticket") {
		await act(async () => {
			const input = document.querySelector("input")!;
			const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
			setter.call(input, "Parent");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 160));
		});
	}
	if (cached)
		await act(async () => {
			await queryClient.invalidateQueries();
		});
	await wait();
	disposals.push(async () => {
		await act(async () => root.unmount());
		container.remove();
		queryClient.clear();
	});
	return {
		picked,
		calls: () => calls,
		recover: () => {
			failed = false;
		},
		retry: async () => {
			const button = [...document.querySelectorAll("button")].find((value) => value.textContent === "Retry")!;
			await act(async () => button.click());
			await wait();
		},
	};
}

for (const kind of ["epic", "wave", "label", "ticket"] as const) {
	test(`${kind} exposes a failed query and recovers through Retry`, async () => {
		const f = await fixture(kind);
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("could not load.");
		expect(document.body.textContent).not.toContain("No results.");
		expect(f.picked).toHaveLength(0);
		f.recover();
		await f.retry();
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(f.calls()).toBe(2);
		expect(document.activeElement?.tagName).toBe("INPUT");
		expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
	});
}

test("a failed label list does not offer to create a label from unknown data", async () => {
	await fixture("label");
	await act(async () => {
		const input = document.querySelector("input")!;
		const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
		setter.call(input, "New label");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	expect(document.body.textContent).not.toContain("No labels.");
	expect(document.body.textContent).not.toContain("Create label");
	expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
});

for (const kind of ["epic", "wave", "label"] as const) {
	test(`${kind} preserves cached options when a refresh fails`, async () => {
		await fixture(kind, true);
		expect(document.querySelector('[role="alert"]')).not.toBeNull();
		expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
	});
}
