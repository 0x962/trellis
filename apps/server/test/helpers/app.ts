import { mkdirSync } from "node:fs";
import {
	type BuiltInHarness,
	createTrellisClient,
	type GhStatus,
	type HarnessModel,
	type Project,
	type Ticket,
	type TrellisClient,
} from "@trellis/api";
import { ulid } from "ulid";
import { createApp } from "../../src/app.ts";
import { type Config, loadConfig } from "../../src/config.ts";
import { openDb } from "../../src/db/client.ts";
import {
	createInlineTransport,
	createWorkerTransport,
	type Runtime,
	type ServiceTransport,
} from "../../src/db/transport.ts";
import type { Tx } from "../../src/db/tx.ts";
import { createBus } from "../../src/events/bus.ts";
import { createGhRunner, type GhRunner } from "../../src/gh/run.ts";
import { createLogger, type LogLevel, type LogRecord } from "../../src/log.ts";
import { fakeIntervalClock } from "./clock.ts";
import { signedInGh } from "./ctx.ts";
import { freshDb, type TestDb } from "./db.ts";
import { freshHomeWithDirs } from "./home.ts";
import { SUPERSET_STUB_BIN } from "./superset-stub.ts";

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

export const DANA = "human:dana";
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
	authToken?: string;
	host?: string;
	db?: TestDb;
	maxUploadMb?: number;
	logLevel?: LogLevel;
	webDist?: string;
	gh?: GhRunner;
	ghStatus?: () => GhStatus;
	version?: string;
	// The TRELLIS_ALLOWED_HOSTS value, a comma-separated hostname list.
	allowedHosts?: string;
	// The superset binary the agents runner spawns. The default is the fake
	// from test/stubs/superset.ts, so no test reaches the real superset.
	supersetBin?: string;
	// The data home. A caller that shares one home across several apps reuses
	// the attachment blobs it already wrote there.
	home?: string;
	// The URLs `system.health` lists.
	addresses?: () => Promise<string[]>;
	bootId?: string;
	// Wraps the transport every procedure calls. The wrapper sees the service
	// name, the request context, and the input of every call, so a test
	// records the calls, delays one, or fails one.
	wrapTransport?: (inner: ServiceTransport) => ServiceTransport;
	// The folder picker `system.chooseDirectory` opens. The default answers
	// the way a canceled dialog does, so no test waits on one.
	chooseDirectory?: () => Promise<string | null>;
	// What `system.harnessModels` answers. The default lists no model, so no
	// test runs a harness program.
	harnessModels?: (harness: BuiltInHarness) => Promise<HarnessModel[]>;
};

export const createTestApp = async (options: TestAppOptions = {}) => {
	const owned = options.db === undefined;
	const h = options.db ?? (await freshDb());
	const home = options.home ?? freshHomeWithDirs();
	const config: Config = loadConfig({
		TRELLIS_HOME: home,
		TRELLIS_AUTH_TOKEN: options.authToken,
		TRELLIS_PORT: "0",
		TRELLIS_HOST: options.host,
		TRELLIS_MAX_UPLOAD_MB: String(options.maxUploadMb ?? 50),
		TRELLIS_LOG_LEVEL: options.logLevel ?? "debug",
		TRELLIS_WEB_DIST: options.webDist ?? `${home}/no-web-dist`,
		TRELLIS_DB_INLINE: process.env.TRELLIS_TEST_TRANSPORT === "worker" ? "false" : "true",
		TRELLIS_ALLOWED_HOSTS: options.allowedHosts,
		TRELLIS_SUPERSET_BIN: options.supersetBin ?? SUPERSET_STUB_BIN,
	});
	// The directories boot creates, so a backup of this home finds db/.
	for (const dir of [config.dbDir, config.tmpDir, config.backupsDir]) mkdirSync(dir, { recursive: true });
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
	const bootId = options.bootId ?? ulid();
	const bus = createBus({ bootId });
	const runtime: Runtime = {
		version: options.version ?? "0.1.0-test",
		bootId,
		gh: options.gh ?? createGhRunner(),
		ghStatus: options.ghStatus ?? signedInGh,
		addresses: options.addresses ?? (async () => ["http://192.168.1.20:4521", "http://127.0.0.1:4521"]),
	};
	const clock = fakeIntervalClock();
	const inner = config.dbInline
		? createInlineTransport({ db: h.db, bus, config, runtime })
		: createWorkerTransport({ bus, config, runtime });
	await inner.start();
	const transport = options.wrapTransport === undefined ? inner : options.wrapTransport(inner);
	const { app, bye } = createApp({
		config,
		log,
		transport,
		bus,
		runtime,
		clock,
		chooseDirectory: options.chooseDirectory ?? (async () => null),
		harnessModels: options.harnessModels ?? (async () => []),
	});

	const fetchThroughApp = (request: Request) => Promise.resolve(app.request(request));
	const as = (actor: string): TrellisClient => createTrellisClient("http://trellis.test", actor, fetchThroughApp);

	const api = async (path: string, call: ApiCall = {}): Promise<ApiResponse> => {
		const headers = new Headers(call.headers);
		const actor = call.actor === undefined ? DANA : call.actor;
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
	// the project cache holds it. The name defaults to the key, because the
	// server refuses a second active root project with a name it already
	// holds, and one test app seeds one project per key.
	const seedProject = async (key = "CDE", name = key): Promise<Project> => {
		const response = await api("/api/projects", { method: "POST", body: { key, name } });
		if (response.status !== 201) throw new Error(`seedProject: ${response.status} ${JSON.stringify(response.body)}`);
		return response.body as Project;
	};

	const createTicket = async (input: Record<string, unknown>, actor: string = DANA): Promise<Ticket> => {
		const response = await api("/api/tickets", { method: "POST", body: input, actor });
		if (response.status !== 201) throw new Error(`createTicket: ${response.status} ${JSON.stringify(response.body)}`);
		return response.body as Ticket;
	};

	// Every call closes the transport, because a test that restarts the
	// transport leaves a second worker on the data directory, and serverTx
	// opens that directory next. The owned in-memory database closes once.
	let dbOpen = owned;
	const close = async () => {
		await inner.close();
		if (!dbOpen) return;
		dbOpen = false;
		h.close();
	};

	// serverTx runs `fn` in a transaction on the database the server writes.
	// The inline transport shares `h.db`. The worker transport holds its own
	// database in `config.dbDir`, and PGlite lets one process open a data
	// directory at a time, so serverTx closes the app before it opens that
	// directory. A test calls serverTx last.
	const serverTx = async <T>(fn: (tx: Tx) => Promise<T>) => {
		if (config.dbInline) return h.db.transaction(fn);
		await close();
		const db = await openDb(config.dbDir);
		const result = await db.transaction(fn);
		await db.$client.close();
		return result;
	};
	// editServerTx stops the database worker before fixture writes and starts it again before API calls resume.
	const editServerTx = async <T>(fn: (tx: Tx) => Promise<T>) => {
		const result = await serverTx(fn);
		if (!config.dbInline) await inner.start();
		return result;
	};

	return {
		app,
		bye,
		api,
		as,
		client: as(DANA),
		seedProject,
		createTicket,
		db: h.db,
		serverTx,
		editServerTx,
		home,
		config,
		bus,
		bootId,
		clock,
		records,
		runtime,
		transport: inner,
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
