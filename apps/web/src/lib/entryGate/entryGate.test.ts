import { afterAll, beforeEach, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { isRedirect } from "@tanstack/react-router";
import type { DefaultActor, FetchLike } from "@trellis/api";

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
const stored = new Map<string, string>();
const localStorage = memoryStorage(stored);
globalThis.localStorage = localStorage;
// `createOrpc` reads `window.location.origin` while the module loads, and a
// test run has no browser. The two imports below wait for it.
globalThis.window = { location: { origin: "http://127.0.0.1:4521" }, localStorage } as Window & typeof globalThis;

const { createOrpc } = await import("../orpc");
const { entryStep, loadEntry } = await import("./entryGate");
type Projects = Awaited<ReturnType<typeof loadEntry>>["projects"];

// What the root route runs in `beforeLoad`.
const gate = async (context: ReturnType<typeof createOrpc>) => entryStep(context, await loadEntry(context));

// The gate counts the projects, so one empty record stands for one project.
const oneProject: Projects = [{} as Projects[number]];

// The body the host writes when it refuses a request before any call runs.
const refusal = () =>
	new Response(
		JSON.stringify({
			defined: false,
			code: "FORBIDDEN",
			status: 403,
			message: "This origin cannot access the Trellis host.",
		}),
		{ status: 403, headers: { "content-type": "application/json" } },
	);

const noRequest: FetchLike = (request) => {
	throw new Error(`The test expected no request, and the app sent one to ${request.url}.`);
};

// A context whose query cache already holds every answer the gate reads, so
// the gate sends no request.
const answered = (projects: Projects, identity: DefaultActor) => {
	const context = createOrpc({ fetch: noRequest, baseUrl: "http://127.0.0.1:4521" });
	context.queryClient.setQueryData(context.orpc.projects.list.queryKey({ input: {} }), projects);
	context.queryClient.setQueryData(context.orpc.actors.default.queryKey({}), identity);
	context.queryClient.setQueryData(context.orpc.settings.get.queryKey(), { defaultActorName: identity.name });
	return context;
};

beforeEach(() => stored.clear());

afterAll(() => {
	if (hadLocalStorage) globalThis.localStorage = originalLocalStorage;
	else Reflect.deleteProperty(globalThis, "localStorage");
	if (hadWindow) globalThis.window = originalWindow;
	else Reflect.deleteProperty(globalThis, "window");
});

test("a refused request throws the refusal and opens no setup step", async () => {
	const context = createOrpc({ fetch: refusal, baseUrl: "http://127.0.0.1:4521" });

	const thrown = await gate(context).then(
		(step) => step,
		(error: unknown) => error,
	);

	expect(isRedirect(thrown)).toBe(false);
	expect(thrown).toBeInstanceOf(ORPCError);
	expect((thrown as ORPCError<string, unknown>).status).toBe(403);
});

test("a server that stores a name and holds a project keeps the page", async () => {
	const context = answered(oneProject, { name: "navid", kind: "human", stored: true });

	expect(await gate(context)).toBe("app");
	expect(stored.get("trellis.actor")).toBe(JSON.stringify({ name: "navid", kind: "human" }));
});

test("a server that stores no name and holds no project opens the name step", async () => {
	const context = answered([], { name: "navid", kind: "human", stored: false });

	expect(await gate(context)).toBe("name");
	expect(stored.size).toBe(0);
});

test("a server that stores a name and holds no project opens the project step", async () => {
	const context = answered([], { name: "navid", kind: "human", stored: true });

	expect(await gate(context)).toBe("project");
});
