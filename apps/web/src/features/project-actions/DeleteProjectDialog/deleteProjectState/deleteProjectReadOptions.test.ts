import { afterAll, expect, test } from "bun:test";
import { QueryObserver } from "@tanstack/react-query";
import { deleteProjectReadOptions } from "./deleteProjectState";

const memoryStorage = (entries: Map<string, string>): Storage => ({
	get length() {
		return entries.size;
	},
	clear: () => entries.clear(),
	getItem: (key: string) => entries.get(key) ?? null,
	key: (index: number) => [...entries.keys()][index] ?? null,
	removeItem: (key: string) => entries.delete(key),
	setItem: (key: string, value: string) => entries.set(key, value),
});

const hadLocalStorage = "localStorage" in globalThis;
const originalLocalStorage = globalThis.localStorage;
const hadWindow = "window" in globalThis;
const originalWindow = globalThis.window;
const localStorage = memoryStorage(new Map());
globalThis.localStorage = localStorage;
globalThis.window = {
	location: { origin: "http://127.0.0.1:4521" },
	localStorage,
} as Window & typeof globalThis;

const { createOrpc } = await import("../../../../lib/orpc");

afterAll(() => {
	if (hadLocalStorage) globalThis.localStorage = originalLocalStorage;
	else Reflect.deleteProperty(globalThis, "localStorage");
	if (hadWindow) globalThis.window = originalWindow;
	else Reflect.deleteProperty(globalThis, "window");
});

test("a ticket-count failure overrides the production list retry", async () => {
	const context = createOrpc({ baseUrl: "http://127.0.0.1:4521" });
	const query = context.orpc.tickets.counts.queryOptions({ input: { project: "DEMO" } });
	expect(context.queryClient.getQueryDefaults(query.queryKey).retry).toBe(true);

	let attempts = 0;
	const observer = new QueryObserver(context.queryClient, {
		queryKey: query.queryKey,
		queryFn: async () => {
			attempts += 1;
			throw new Error("Ticket count failed.");
		},
		...deleteProjectReadOptions,
	});
	const result = await new Promise<ReturnType<typeof observer.getCurrentResult>>((resolve) => {
		const unsubscribe = observer.subscribe((value) => {
			if (!value.isError) return;
			unsubscribe();
			resolve(value);
		});
	});

	expect(attempts).toBe(1);
	expect(result.error).toEqual(new Error("Ticket count failed."));
	context.queryClient.clear();
});
