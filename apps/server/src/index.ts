import { mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import type { GhStatus } from "@trellis/api";
import { ulid } from "ulid";
import pkg from "../package.json";
import { createApp } from "./app.ts";
import { type Env, loadConfig } from "./config.ts";
import { openDatabase } from "./db/open.ts";
import { createInlineTransport, createWorkerTransport } from "./db/transport.ts";
import { createBus } from "./events/bus.ts";
import { createGhRunner } from "./gh/run.ts";
import { listenAddresses } from "./listen.ts";
import { createLogger, createRotatingSink, type LogSink, stdoutSink, teeSink } from "./log.ts";
import { checkGh } from "./services/system.ts";
import { sweep } from "./storage/blobs.ts";

// Something that starts once the port is open and stops during the
// shutdown: the poller, the maintenance timer.
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

// Boot: config, the data home directories, the gh check off the boot path,
// the database and its migrations, the blob sweep, then listen. SIGTERM
// says bye on every stream, stops accepting, waits for the requests in
// flight, stops the hooks, closes the database, and exits 0. A second
// signal exits at once. A boot failure logs one line and exits 1.
export const boot = async ({ env = process.env, hooks = [], exit = process.exit, sink }: BootOptions = {}) => {
	const config = loadConfig(env);
	for (const dir of [config.dbDir, config.tmpDir, config.backupsDir]) mkdirSync(dir, { recursive: true });
	const log = createLogger({
		level: config.logLevel,
		sink: sink ?? teeSink([stdoutSink(), createRotatingSink({ path: config.logFile, maxBytes: 10 * MB, maxFiles: 5 })]),
		env,
	});

	const run = async () => {
		const gh = createGhRunner();
		let ghState: GhStatus = { ok: false, user: null, reason: "error", message: "Not checked yet.", checkedAt: null };
		void checkGh(gh, new Date()).then((status) => {
			ghState = status;
			log.info("gh", { ok: status.ok, user: status.user, reason: status.reason });
		});

		const bootId = ulid();
		const bus = createBus({ bootId });
		// TRELLIS_PORT=0 lets the kernel pick the port, so the real port is known
		// once the listener is open. No request reaches a service before then.
		let port = config.port;
		const runtime = {
			version: pkg.version,
			bootId,
			gh,
			ghStatus: () => ghState,
			addresses: async () => listenAddresses(config.host, port, networkInterfaces()),
		};
		const database = config.dbInline ? await openDatabase(config.dbDir) : undefined;
		const transport = database
			? createInlineTransport({ db: database.db, bus, config, runtime, applied: database.applied })
			: createWorkerTransport({ bus, config, runtime });
		const started = await transport.start();
		log.info("migrate", { applied: started.applied });
		const swept = await sweep(config.home, started.liveShas);
		log.info("sweep", { removedBlobs: swept.removedBlobs.length, removedTemp: swept.removedTemp.length });
		const { app, bye } = createApp({ config, log, transport, bus, runtime });

		// An event stream is silent between pings, 15 seconds apart by default.
		// Bun closes a connection that is silent for `idleTimeout` seconds, so 0
		// turns that timer off and the stream stays open.
		const server = Bun.serve({ port: config.port, hostname: config.host, idleTimeout: 0, fetch: app.fetch });
		port = server.port!;
		log.info("listening", { host: config.host, port, home: config.home, version: pkg.version });
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
