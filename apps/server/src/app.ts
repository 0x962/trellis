import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin, ResponseHeadersPlugin } from "@orpc/server/plugins";
import type { StandardHandlerOptions } from "@orpc/server/standard";
import { errors, reviewHref } from "@trellis/api";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { hostAuth } from "./auth/auth.ts";
import type { Config } from "./config.ts";
import { API_VERSION } from "./context.ts";
import type { Runtime, ServiceTransport } from "./db/transport.ts";
import type { Bus } from "./events/bus.ts";
import type { GhAccess } from "./ghState.ts";
import { isAllowedHost } from "./hostCheck.ts";
import type { Logger } from "./log.ts";
import { chooseDirectory } from "./native/chooseDirectory";
import { type ProcedureContext, router } from "./procedures/index.ts";
import { docsRoutes } from "./routes/docs.ts";
import { type Clock, createEventsRoute, realClock } from "./routes/events.ts";
import { exportRoute } from "./routes/export.ts";
import { filesRoute } from "./routes/files.ts";
import { prFileRoute } from "./routes/prFile.ts";
import { resourceBlobRoute } from "./routes/resourceBlob.ts";
import { reviewImageRoute } from "./routes/reviewImage";
import { staticRoute } from "./routes/static.ts";
import { terminalSocketRoute } from "./routes/terminalSocket/terminalSocket.ts";
import { terminalStreamRoute } from "./routes/terminalStream.ts";
import { createDbTiming, type DbTiming, serverTimingHeader } from "./serverTiming.ts";
import { checkGh } from "./services/system.ts";

export type AppOptions = {
	config: Config;
	log: Logger;
	transport: ServiceTransport;
	bus: Bus;
	runtime: Runtime;
	clock?: Clock;
	// The folder picker `system.chooseDirectory` opens. A test gives its own,
	// so no suite waits on a dialog nobody can answer.
	chooseDirectory?: () => Promise<string | null>;
	// What `system.gh` and `system.checkGh` answer with. The boot gives the gh
	// state it keeps. The default reads `runtime.ghStatus`, and its check runs
	// `gh auth status` through `runtime.gh` and keeps no answer.
	gh?: GhAccess;
};

// The Vite dev server and the localhost gateway. Every other origin gets no
// CORS header, so a page elsewhere cannot read the API.
const DEV_ORIGINS = ["http://localhost:5173", "http://trellis.localhost"];

const MB = 1024 * 1024;

const HOST_REFUSED =
	"The Host header names a hostname this server does not serve. Use 127.0.0.1, localhost, or the TRELLIS_HOST name. To allow a proxy hostname, add it to TRELLIS_ALLOWED_HOSTS.";

const roundMs = (ms: number) => Math.round(ms * 10) / 10;

// The request log fields of a procedure request: the wait in the queue of
// the database worker, the wait for the database lock, and the database
// time. A request that reached no procedure has no timing and no fields.
const timingFields = (timing: DbTiming | undefined) =>
	timing === undefined
		? {}
		: { queueMs: roundMs(timing.queueMs), lockMs: roundMs(timing.lockMs), dbMs: roundMs(timing.ms) };

// The wire shape of every error, the same one the oRPC handlers write.
const errorBody = (code: keyof typeof errors, data?: unknown) => ({
	defined: true,
	code,
	status: errors[code].status,
	message: errors[code].message,
	data,
});

const orpcBody = (error: ORPCError<string, unknown>) => ({
	defined: error.defined,
	code: error.code,
	status: error.status,
	message: error.message,
	data: error.data,
});

// A DELETE carries its options in the query string, as a GET does. The
// OpenAPI codec reads the body of every non-GET request, so the query
// becomes a JSON body here.
const deleteWithQuery = (request: Request) => {
	const url = new URL(request.url);
	if (request.method !== "DELETE" || url.search === "") return request;
	const headers = new Headers(request.headers);
	headers.set("content-type", "application/json");
	return new Request(url, { method: "DELETE", headers, body: JSON.stringify(Object.fromEntries(url.searchParams)) });
};

// The middleware chain: request id, the request log line and the api
// version header, the Host check, cors, the body limit on the two upload
// paths, the RPC handler at /rpc, the OpenAPI handler at /api, the plain
// routes, a JSON 404 under the two mounts, and the web app for everything
// else.
export const createApp = ({
	config,
	log,
	transport,
	bus,
	runtime,
	clock = realClock,
	chooseDirectory: chooseFolder = chooseDirectory,
	gh = { read: async () => runtime.ghStatus(), check: () => checkGh(runtime.gh, new Date()) },
}: AppOptions) => {
	const app = new Hono();
	// The database timing of each procedure request, by its request. The
	// request log line reads it. A streaming batch writes its line when its
	// headers go out, so that line counts only the calls done by then.
	const timings = new WeakMap<Request, DbTiming>();
	const events = createEventsRoute({ bus, runtime, transport, clock });
	const docs = docsRoutes();

	app.use(requestId());

	app.use(async (c, next) => {
		const started = performance.now();
		await next();
		if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
			c.res.headers.set("x-request-id", c.get("requestId"));
			c.res.headers.set("x-trellis-api-version", API_VERSION);
		}
		const line = {
			reqId: c.get("requestId"),
			method: c.req.method,
			path: c.req.path,
			status: c.res.status,
			ms: Math.round((performance.now() - started) * 10) / 10,
			actor: c.req.header("x-trellis-actor") ?? null,
			// The host refuses with 403 a request that names a hostname it
			// does not serve, and a request from a browser page of another
			// origin. Both values are request headers that no other field of
			// this line holds, so a refused line names its own cause.
			...(c.res.status === 403 ? { host: c.req.header("host") ?? null, origin: c.req.header("origin") ?? null } : {}),
			...timingFields(timings.get(c.req.raw)),
		};
		if (c.req.method === "GET") log.debug("request", line);
		else log.info("request", line);
	});

	// Every HTTP/1.1 request carries a Host header. A request built inside
	// the process with `app.request` may carry none, and it is served.
	app.use(async (c, next) => {
		const host = c.req.header("host");
		if (host !== undefined && !isAllowedHost(host, config)) {
			return c.json({ defined: false, code: "FORBIDDEN", status: 403, message: HOST_REFUSED }, 403);
		}
		await next();
	});

	app.use(hostAuth(config.authToken));
	const corsMiddleware = cors({ origin: (origin) => (DEV_ORIGINS.includes(origin) ? origin : null) });
	app.use((c, next) => (c.req.header("upgrade")?.toLowerCase() === "websocket" ? next() : corsMiddleware(c, next)));

	const maxBytes = config.maxUploadMb * MB;
	app.use(
		"/api/tickets/:ticket/attachments",
		bodyLimit({ maxSize: maxBytes, onError: (c) => c.json(errorBody("PAYLOAD_TOO_LARGE", { maxBytes }), 413) }),
	);
	app.use(
		"/api/prs/:id/files/:fileId",
		bodyLimit({ maxSize: maxBytes, onError: (c) => c.json(errorBody("PAYLOAD_TOO_LARGE", { maxBytes }), 413) }),
	);
	// The RPC codec wraps every body in `json`. The limit answers before the
	// handler runs, so it writes that shape itself; without it the client
	// reads an undefined error and never sees the cap it must report.
	app.use(
		"/rpc/attachments/upload",
		bodyLimit({
			maxSize: maxBytes,
			onError: (c) => c.json({ json: errorBody("PAYLOAD_TOO_LARGE", { maxBytes }) }, 413),
		}),
	);
	app.use(
		"/rpc/pullRequests/uploadFile",
		bodyLimit({
			maxSize: maxBytes,
			onError: (c) => c.json({ json: errorBody("PAYLOAD_TOO_LARGE", { maxBytes }) }, 413),
		}),
	);

	const interceptors: StandardHandlerOptions<ProcedureContext>["interceptors"] = [
		onError((error, { context, request }) => {
			if (error instanceof ORPCError && error.status < 500) return;
			log.error("procedure failed", {
				reqId: context.reqId,
				path: request.url.pathname,
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
		}),
	];
	const plugins = [new ResponseHeadersPlugin<ProcedureContext>()];
	// The web app sends the calls of one tick as a single POST to
	// /rpc/__batch__. Without BatchHandlerPlugin that path has no route and
	// every page that reads two queries at once fails with a 404.
	const rpc = new RPCHandler<ProcedureContext>(router, {
		plugins: [new BatchHandlerPlugin<ProcedureContext>(), ...plugins],
		interceptors,
	});
	const api = new OpenAPIHandler<ProcedureContext>(router, { plugins, interceptors });
	const contextOf = (c: Context): ProcedureContext => {
		const timing = createDbTiming();
		timings.set(c.req.raw, timing);
		return {
			headers: c.req.raw.headers,
			reqId: c.get("requestId"),
			transport,
			actor: null,
			timing,
			chooseDirectory: chooseFolder,
			gh,
		};
	};
	// Every procedure response carries the database time of its request. A
	// request that fails before any service call reports 0.
	const timed = (response: Response, context: ProcedureContext) => {
		response.headers.set("server-timing", serverTimingHeader(context.timing));
		return response;
	};
	app.use("/rpc/*", async (c, next) => {
		const context = contextOf(c);
		const result = await rpc.handle(c.req.raw, { prefix: "/rpc", context });
		if (result.matched) return timed(result.response, context);
		await next();
	});
	app.use("/api/*", async (c, next) => {
		const context = contextOf(c);
		const result = await api.handle(deleteWithQuery(c.req.raw), { prefix: "/api", context });
		if (result.matched) return timed(result.response, context);
		await next();
	});

	app.get("/api/review-image", reviewImageRoute(transport));
	app.get("/api/evidence/:fileId/file", prFileRoute({ config, transport }));
	app.get("/api/resources/:id/blob", resourceBlobRoute({ config, transport }));
	app.get("/api/events", events.handler);
	app.get("/api/agent-runs/:id/terminal/stream", terminalStreamRoute(config, transport));
	app.get("/api/agent-runs/:id/terminal/socket", terminalSocketRoute(config, transport));
	app.get("/api/attachments/:id/file", filesRoute({ config, transport }));
	app.get("/api/export", exportRoute({ transport }));
	app.get("/api/openapi.json", docs.spec);
	app.get("/api/docs", docs.docs);

	const notFound = (c: Context) => c.json(errorBody("NOT_FOUND", { kind: "route", ref: c.req.path }), 404);
	app.all("/api/*", notFound);
	app.all("/rpc/*", notFound);

	app.get("*", async (c) => {
		if (/^\/https?:\/\/github\.com\//.test(c.req.path)) return c.redirect(reviewHref(c.req.path.slice(1)), 302);
		return staticRoute(config)(c);
	});

	app.onError((error, c) => {
		if (error instanceof ORPCError) return c.json(orpcBody(error), error.status as ContentfulStatusCode);
		log.error("unhandled", { reqId: c.get("requestId"), path: c.req.path, message: (error as Error).message });
		return c.json(
			{
				defined: false,
				code: "INTERNAL_SERVER_ERROR",
				status: 500,
				message:
					"The server failed on this request. Find the cause in server.log with the x-request-id of this response.",
			},
			500,
		);
	});

	return { app, bye: events.bye };
};

export type App = ReturnType<typeof createApp>["app"];
