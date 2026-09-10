import { createTrellisClient, type GhStatus, type Project, type Ticket, type TrellisClient } from "@trellis/api";
import { ulid } from "ulid";
import { createApp } from "../../src/app.ts";
import { type Config, loadConfig } from "../../src/config.ts";
import { createInlineTransport, type Runtime } from "../../src/db/transport.ts";
import { createBus } from "../../src/events/bus.ts";
import { createGhRunner, type GhRunner } from "../../src/gh/run.ts";
import { createLogger, type LogLevel, type LogRecord } from "../../src/log.ts";
import { fakeIntervalClock } from "./clock.ts";
import { signedInGh } from "./ctx.ts";
import { freshDb, type TestDb } from "./db.ts";
import { freshHomeWithDirs } from "./home.ts";

// createTestApp builds the HTTP app the way index.ts does, against an
// in-memory database and a temporary data home, and hands back every part a
// contract test reads: the Hono app, a typed RPC client over `app.request`,
// a curl-shaped `api` call, the log records, the bus, and the fake clock.
//
// The parts it wires, in the shape the builder implements:
//   loadConfig(env)                              src/config.ts
//   createLogger({ level, sink, env })           src/log.ts
//   createBus({ bootId })                        src/events/bus.ts
//   createInlineTransport({ db, bus, config, runtime })   src/db/transport.ts
//   createApp({ config, log, transport, bus, runtime, clock })   src/app.ts
//     returns { app, bye(reason) }.
// `transport.start()` loads the project cache; the worker transport spawns
// its thread there instead.

export const NAVID = "human:navid";
export const CLAUDE = "agent:claude-code";

export type ApiCall = {
	method?: string;
	body?: unknown;
	raw?: BodyInit;
	actor?: string | null;
	headers?: Record<string, string>;
};

export type ApiResponse = {
	status: number;
	headers: Headers;
	// biome-ignore lint/suspicious/noExplicitAny: a contract test reads any field of the wire shape.
	body: any;
};

export type TestAppOptions = {
	db?: TestDb;
	maxUploadMb?: number;
	logLevel?: LogLevel;
	webDist?: string;
	gh?: GhRunner;
	ghStatus?: () => GhStatus;
	version?: string;
};

export const createTestApp = async (options: TestAppOptions = {}) => {
	const owned = options.db === undefined;
	const h = options.db ?? (await freshDb());
	const home = freshHomeWithDirs();
	const config: Config = loadConfig({
		TRELLIS_HOME: home,
		TRELLIS_PORT: "0",
		TRELLIS_MAX_UPLOAD_MB: String(options.maxUploadMb ?? 50),
		TRELLIS_LOG_LEVEL: options.logLevel ?? "debug",
		TRELLIS_WEB_DIST: options.webDist ?? `${home}/no-web-dist`,
		TRELLIS_DB_INLINE: "true",
	});
	const records: LogRecord[] = [];
	const log = createLogger({
		level: config.logLevel,
		sink: {
			isTTY: false,
			write: (line: string) => {
				records.push(JSON.parse(line) as LogRecord);
			},
		},
		env: {},
	});
	const bootId = ulid();
	const bus = createBus({ bootId });
	const runtime: Runtime = {
		version: options.version ?? "0.1.0-test",
		bootId,
		gh: options.gh ?? createGhRunner(),
		ghStatus: options.ghStatus ?? signedInGh,
	};
	const clock = fakeIntervalClock();
	const transport = createInlineTransport({ db: h.db, bus, config, runtime });
	await transport.start();
	const { app, bye } = createApp({ config, log, transport, bus, runtime, clock });

	const fetchThroughApp = (request: Request) => Promise.resolve(app.request(request));
	const as = (actor: string): TrellisClient => createTrellisClient("http://trellis.test", actor, fetchThroughApp);

	const api = async (path: string, call: ApiCall = {}): Promise<ApiResponse> => {
		const headers = new Headers(call.headers);
		const actor = call.actor === undefined ? NAVID : call.actor;
		if (actor !== null) headers.set("x-trellis-actor", actor);
		let body: BodyInit | undefined = call.raw;
		if (call.body !== undefined) {
			headers.set("content-type", "application/json");
			body = JSON.stringify(call.body);
		}
		const response = await app.request(`http://trellis.test${path}`, { method: call.method ?? "GET", headers, body });
		const type = response.headers.get("content-type") ?? "";
		const parsed = type.includes("json") ? await response.json() : await response.text();
		return { status: response.status, headers: response.headers, body: parsed };
	};

	// A root project with its six seeded statuses, created through the API so
	// the project cache holds it.
	const seedProject = async (key = "CDE", name = "Code"): Promise<Project> => {
		const response = await api("/api/projects", { method: "POST", body: { key, name } });
		if (response.status !== 201) throw new Error(`seedProject: ${response.status} ${JSON.stringify(response.body)}`);
		return response.body as Project;
	};

	const createTicket = async (input: Record<string, unknown>, actor: string = NAVID): Promise<Ticket> => {
		const response = await api("/api/tickets", { method: "POST", body: input, actor });
		if (response.status !== 201) throw new Error(`createTicket: ${response.status} ${JSON.stringify(response.body)}`);
		return response.body as Ticket;
	};

	const close = async () => {
		await transport.close();
		if (owned) h.close();
	};

	return {
		app,
		bye,
		api,
		as,
		client: as(NAVID),
		seedProject,
		createTicket,
		db: h.db,
		home,
		config,
		bus,
		bootId,
		clock,
		records,
		runtime,
		close,
	};
};

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

// The status a seeded project carries under `slug`.
export const statusOf = (project: Project, slug: string) => {
	const status = project.statuses.find((candidate) => candidate.slug === slug);
	if (status === undefined) throw new Error(`no status ${slug} on ${project.key}`);
	return status;
};

// The ids of the six seeded statuses, keyed the way the fixtures key them.
export const statusIds = (project: Project) => ({
	todo: statusOf(project, "todo").id,
	started: statusOf(project, "in-progress").id,
	agentReview: statusOf(project, "agent-review").id,
	humanReview: statusOf(project, "human-review").id,
	done: statusOf(project, "done").id,
	canceled: statusOf(project, "canceled").id,
});
