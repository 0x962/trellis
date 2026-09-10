import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin, ResponseHeadersPlugin } from "@orpc/server/plugins";
import { createTrellisClient, type FetchLike } from "@trellis/api";
import { Hono } from "hono";
import { ulid } from "ulid";
import { createEventBus } from "./events";
import type { BaseContext, Call } from "./implementer";
import { router } from "./router";
import { createEmptyState, seedState } from "./seed";
import type { State } from "./state";

export type { Call } from "./implementer";

export type FakeServerOptions = {
	// No projects and no tickets: the setup flow starts here.
	empty?: boolean;
	// The interval of the `: ping` comment on the event stream.
	pingMs?: number;
};

export const apiVersion = "1";
export const serverVersion = "0.0.0-fake";

// The origin the test clients address. `app.request` reads the path only.
const origin = "http://trellis.local";

// A Hono app that implements the @trellis/api contract in memory: the RPC
// handler at /rpc, the OpenAPI handler at /api, and the event stream at
// /api/events. Tests call it through `app.request`; `bun run dev:fake`
// serves it on 4522.
export const createFakeServer = (options: FakeServerOptions = {}) => {
	const now = Date.now();
	const state: State = options.empty ? createEmptyState(now) : seedState(now);
	const bootId = ulid();
	const versions = { server: serverVersion, api: apiVersion };
	const bus = createEventBus(state, bootId, options.pingMs ?? 15_000, versions);
	const calls: Call[] = [];
	const rpc = new RPCHandler(router, { plugins: [new BatchHandlerPlugin(), new ResponseHeadersPlugin()] });
	const api = new OpenAPIHandler(router, { plugins: [new ResponseHeadersPlugin()] });

	const contextOf = (request: Request): BaseContext => {
		const ifMatch = request.headers.get("if-match");
		return {
			state,
			bus,
			calls,
			actorHeader: request.headers.get("x-trellis-actor"),
			ifMatch: ifMatch === null ? null : Number(ifMatch.replace(/"/g, "")),
			resHeaders: new Headers({ "x-trellis-api-version": apiVersion }),
			versions,
		};
	};

	const app = new Hono();
	app.use("*", async (c, next) => {
		await next();
		c.header("x-trellis-api-version", apiVersion);
	});
	app.get("/api/events", (c) => bus.handle(c.req.raw));
	app.use("/rpc/*", async (c, next) => {
		const { matched, response } = await rpc.handle(c.req.raw, { prefix: "/rpc", context: contextOf(c.req.raw) });
		if (matched) return response;
		await next();
	});
	app.use("/api/*", async (c, next) => {
		const { matched, response } = await api.handle(c.req.raw, { prefix: "/api", context: contextOf(c.req.raw) });
		if (matched) return response;
		await next();
	});

	const fetch: FetchLike = (request, init) => app.request(request, init);
	const clientAs = (actor: string) => createTrellisClient(origin, actor, fetch);

	return {
		app,
		state,
		bootId,
		calls,
		client: clientAs("human:navid"),
		clientAs,
		fetch,
		shutdown: () => bus.shutdown(),
	};
};

export type FakeServer = ReturnType<typeof createFakeServer>;
