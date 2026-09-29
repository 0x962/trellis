import { expect, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PageSummary, PageWatcherOptionsOutput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { PageWatcher } from "./PageWatcher";

const domTest = test.skipIf(typeof document === "undefined");
const page = {
	id: "page",
	projectId: "project",
	watcher: { agent: { id: "watcher", name: "Current watcher" } },
} as PageSummary;

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
}

async function mount(read: (cursor?: string) => Promise<PageWatcherOptionsOutput>) {
	const observe = ResizeObserver.prototype.observe;
	const observer = spyOn(ResizeObserver.prototype, "observe").mockImplementation(function (
		this: ResizeObserver,
		element,
		options,
	) {
		if (!(element instanceof Element)) throw new TypeError("ResizeObserver requires an Element");
		observe.call(this, element, options);
	});
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0, gcTime: 0 } } });
	const selected: (string | null)[] = [];
	const app = {
		orpc: {
			pages: {
				key: () => ["pages"],
				watch: { call: async ({ agentId }: { agentId: string | null }) => selected.push(agentId) },
				watcherOptions: {
					infiniteOptions: (options: {
						initialPageParam: undefined;
						getNextPageParam: (result: PageWatcherOptionsOutput) => string | undefined;
					}) => ({
						...options,
						queryKey: ["watchers"],
						queryFn: ({ pageParam }: { pageParam?: string }) => read(pageParam),
					}),
				},
			},
		},
	} as unknown as AppContext;
	const render = async (disabled: boolean) => {
		await act(async () => {
			root.render(
				<QueryClientProvider client={client}>
					<AppProvider value={app}>
						<PageWatcher page={page} disabled={disabled} />
					</AppProvider>
				</QueryClientProvider>,
			);
		});
	};
	await render(false);
	return {
		container,
		selected,
		render,
		async close() {
			await act(async () => root.unmount());
			client.clear();
			container.remove();
			observer.mockRestore();
		},
	};
}

domTest("1000 eligible watchers mount only visible rows and allow a distant selection", async () => {
	const requested: (string | undefined)[] = [];
	const fixture = await mount(async (cursor) => {
		requested.push(cursor);
		const start = Number(cursor ?? 0);
		return {
			items: Array.from({ length: 100 }, (_, offset) => ({
				id: `agent-${start + offset}`,
				name: `Agent ${start + offset}`,
			})),
			nextCursor: start < 900 ? String(start + 100) : null,
		};
	});
	try {
		for (let i = 0; i < 30 && fixture.container.querySelector("button")!.disabled; i++) await settle();
		expect(requested).toEqual([undefined, "100", "200", "300", "400", "500", "600", "700", "800", "900"]);
		const trigger = fixture.container.querySelector<HTMLButtonElement>("[aria-label='Page watcher']")!;
		expect(trigger.disabled).toBe(false);
		expect(trigger.textContent).toContain("Current watcher");
		await act(async () => trigger.click());
		await settle();
		const list = document.querySelector<HTMLElement>("[role='listbox']")!;
		expect(list).not.toBeNull();
		expect(document.activeElement).toBe(list);
		expect(list.scrollTop).toBeGreaterThan(0);
		expect(document.querySelectorAll("[role='option']").length).toBeLessThanOrEqual(14);
		await act(async () => {
			list.scrollTop = 990 * 28;
			list.dispatchEvent(new Event("scroll", { bubbles: true }));
		});
		const options = [...document.querySelectorAll<HTMLElement>("[role='option']")];
		expect(options.length).toBeLessThanOrEqual(14);
		expect(options.some((option) => option.textContent === "Agent 999")).toBe(true);
		await act(async () => options.find((option) => option.textContent === "Agent 999")!.click());
		expect(fixture.selected).toEqual(["agent-999"]);
		await act(async () => trigger.click());
		await settle();
		const reopened = document.querySelector<HTMLElement>("[role='listbox']")!;
		await act(async () => reopened.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
		await settle();
		expect(document.querySelector("[role='option'][data-highlighted]")?.textContent).toBe("No watcher");
		expect(document.querySelectorAll("[role='option']").length).toBeLessThanOrEqual(14);
		await act(async () => reopened.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
		await settle();
		expect(document.querySelector("[role='option'][data-highlighted]")?.textContent).toBe("Current watcher");
		await act(async () => reopened.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
		await settle();
		expect(document.querySelector("[role='option'][data-highlighted]")?.textContent).toBe("Agent 999");
		expect(document.querySelectorAll("[role='option']").length).toBeLessThanOrEqual(14);
		await act(async () => reopened.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect(fixture.selected).toEqual(["agent-999", "agent-999"]);
		await act(async () => trigger.click());
		await settle();
		const lastOpen = document.querySelector<HTMLElement>("[role='listbox']")!;
		await act(async () => lastOpen.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
		await settle();
		await act(async () => lastOpen.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect(fixture.selected).toEqual(["agent-999", "agent-999", null]);
	} finally {
		await fixture.close();
	}
});

domTest("a failed second page stops requests after query retries and keeps the watcher visible", async () => {
	let calls = 0;
	const fixture = await mount(async (cursor) => {
		calls++;
		if (cursor !== undefined) throw new Error("Second page unavailable");
		return { items: [{ id: "first", name: "First" }], nextCursor: "next" };
	});
	try {
		for (let i = 0; i < 5; i++) await settle();
		expect(calls).toBe(3);
		expect(fixture.container.textContent).toContain("Agents did not load.");
		expect(fixture.container.textContent).toContain("Current watcher");
		await fixture.render(false);
		for (let i = 0; i < 5; i++) await settle();
		expect(calls).toBe(3);
		expect(fixture.selected).toEqual([]);
	} finally {
		await fixture.close();
	}
});

domTest("disabling the selector during a request prevents the next page", async () => {
	let calls = 0;
	let finish!: (result: PageWatcherOptionsOutput) => void;
	const fixture = await mount(async () => {
		calls++;
		return new Promise<PageWatcherOptionsOutput>((resolve) => {
			finish = resolve;
		});
	});
	try {
		await fixture.render(true);
		await act(async () => finish({ items: [], nextCursor: "next" }));
		for (let i = 0; i < 5; i++) await settle();
		expect(calls).toBe(1);
	} finally {
		await fixture.close();
	}
});
