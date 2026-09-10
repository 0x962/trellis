import { mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { ulid } from "ulid";
import pkg from "../package.json";
import { createApp } from "./app.ts";
import { type Env, loadConfig } from "./config.ts";
import { openDatabase } from "./db/open.ts";
import { createInlineTransport, createWorkerTransport } from "./db/transport.ts";
import { createBus } from "./events/bus.ts";
import { createGhRunner } from "./gh/run.ts";
import { createGhState } from "./ghState.ts";
import { lockHome } from "./homeLock.ts";
import { listenAddresses } from "./listen.ts";
import { createLogger, createRotatingSink, type LogSink, stdoutSink, teeSink } from "./log.ts";
import { sweepBackups } from "./storage/backups.ts";
import { sweep } from "./storage/blobs.ts";

// Something that starts once the port is open and stops during the
// shutdown, before the poller drains.
export type StartHook = {
	name: string;
	start: () => void | Promise<void>;
	stop: () => void | Promise<void>;
};

export type BootOptions = {
	env?: Env;
	hooks?: StartHook[];
	exit?: (code: number) => void;
	sink?: LogSink;
};

const MB = 1024 * 1024;

// A client that connected just before SIGTERM gets this long to send its
// request before the listener closes.
const SHUTDOWN_GRACE_MS = 100;

// A request in flight when the listener closes gets this long to finish.
const SHUTDOWN_DEADLINE_MS = 4000;

type Fetch = (request: Request) => Response | Promise<Response>;

// Boot: config, the data home lock, the port, the data home directories,
// the gh check off the boot path, the database and its migrations with the
// poller and the maintenance timer beside it, the blob sweep, then the app.
//
// The lock and the port come before the database. Two PGlite instances on
// one data directory corrupt it, so a second server on a held home, or a
// server whose port is taken, exits 1 before it opens the database. The
// listener answers 503 until the app is ready.
//
// SIGTERM says bye on every stream, stops accepting, waits for the requests
// in flight, stops the hooks, drains the poller for up to 5 s, closes the
// database, and exits 0. A second signal exits at once. A boot failure logs
// one line and exits 1.
export const boot = async ({ env = process.env, hooks = [], exit = process.exit, sink }: BootOptions = {}) => {
	const config = loadConfig(env);
	mkdirSync(config.home, { recursive: true });
	const log = createLogger({
		level: config.logLevel,
		sink: sink ?? teeSink([stdoutSink(), createRotatingSink({ path: config.logFile, maxBytes: 10 * MB, maxFiles: 5 })]),
		env,
	});

	const run = async () => {
		const lock = lockHome(config.home, "server", config.port);
		let handler: Fetch = () =>
			new Response("The trellis server is not ready. Try again in a few seconds.", { status: 503 });

		// An event stream is silent between pings, 15 seconds apart by default.
		// Bun closes a connection that is silent for `idleTimeout` seconds, so 0
		// turns that timer off and the stream stays open.
		const server = Bun.serve({
			port: config.port,
			hostname: config.host,
			idleTimeout: 0,
			fetch: (request) => handler(request),
		});
		lock.setPort(server.port!);
		for (const dir of [config.dbDir, config.tmpDir, config.backupsDir]) mkdirSync(dir, { recursive: true });
		const leftovers = sweepBackups(config.backupsDir);
		if (leftovers.length > 0) log.info("backup sweep", { removed: leftovers });

		const gh = createGhRunner();
		const bootId = ulid();
		const bus = createBus({ bootId });
		const ghState = createGhState({ bus, gh, now: () => new Date() });
		void ghState.check().then((status) => {
			log.info("gh", { ok: status.ok, user: status.user, reason: status.reason });
		});

		// TRELLIS_PORT=0 lets the kernel pick the port, so `server.port` is the
		// real port.
		const runtime = {
			version: pkg.version,
			bootId,
			gh,
			ghStatus: ghState.current,
			addresses: async () => listenAddresses(config.host, server.port!, networkInterfaces()),
		};
		const database = config.dbInline ? await openDatabase(config.dbDir) : undefined;
		const transport = database
			? createInlineTransport({ db: database.db, bus, config, runtime, applied: database.applied })
			: createWorkerTransport({ bus, config, runtime });
		const started = await transport.start({ clockRate: config.clockRate, log: (msg, fields) => log.info(msg, fields) });
		log.info("migrate", { applied: started.applied });
		const swept = await sweep(config.home, started.liveShas);
		log.info("sweep", { removedBlobs: swept.removedBlobs.length, removedTemp: swept.removedTemp.length });
		const { app, bye } = createApp({ config, log, transport, bus, runtime });
		handler = app.fetch;
		log.info("listening", { host: config.host, port: server.port, home: config.home, version: pkg.version });
		for (const hook of hooks) await hook.start();

		let stopping = false;
		const detach = () => {
			process.off("SIGTERM", onSignal);
			process.off("SIGINT", onSignal);
		};
		const shutdown = async () => {
			await Bun.sleep(SHUTDOWN_GRACE_MS);
			bye("shutdown");
			await Promise.race([server.stop(), Bun.sleep(SHUTDOWN_DEADLINE_MS)]);
			for (const hook of hooks) await hook.stop();
			await transport.close();
			if (database) await database.close();
			lock.release();
			log.info("closed", { bootId });
			log.close();
			detach();
			exit(0);
		};
		const onSignal = () => {
			if (stopping) {
				detach();
				exit(1);
				return;
			}
			stopping = true;
			void shutdown();
		};
		process.on("SIGTERM", onSignal);
		process.on("SIGINT", onSignal);
	};

	await run().catch((error: unknown) => {
		log.error((error as Error).message);
		log.close();
		exit(1);
	});
};

if (import.meta.main) void boot();
