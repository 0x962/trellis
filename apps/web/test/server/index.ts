import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createTrellisClient, type FetchLike, type GhStatus, type TrellisClient } from "@trellis/api";
import type { RequestContext } from "../../../server/src/context.ts";
import type { ServiceTransport } from "../../../server/src/db/transport.ts";
import { fail } from "../../../server/src/errors.ts";
import { blobPath } from "../../../server/src/storage/blobs.ts";
import { createTestApp, type TestApp } from "../../../server/test/helpers/app.ts";
import { seedSnapshot } from "./cache.ts";
import { sharedDb } from "./db.ts";
import { createHooks, type Hooks } from "./hooks.ts";
import { attachmentBytes } from "./seed/support.ts";
import { seedDoneToday } from "./seed/today.ts";
import { restore } from "./snapshot.ts";

// The real server in this process: the Hono app of apps/server over an
// in-memory PGlite, with the seed restored before every build. The web tests
// address it through `fetch`, which is what `createOrpc` takes.

// One recorded service call: the dotted service name as a path, the input the
// procedure passed on, and the actor of the request.
export type Call = { path: string[]; input: unknown; actor: string | null };

export type TestServerOptions = {
	// No projects and no tickets: the setup flow starts here.
	empty?: boolean;
	// What `system.gh` reports. A signed-out gh by default, as a machine
	// without the binary reports.
	gh?: GhStatus;
	// The URLs `system.health` lists.
	addresses?: string[];
	maxUploadBytes?: number;
};

export const defaultMaxUploadBytes = 50 * 1024 * 1024;

// The origin the test clients address. `app.request` reads the path only.
const origin = "http://trellis.local";

const missingGh: GhStatus = {
	ok: false,
	user: null,
	reason: "missing",
	message: "gh is not installed. Install it with `brew install gh` and run `gh auth login`.",
	checkedAt: new Date().toISOString(),
};

const actorHeader = (ctx: RequestContext) => (ctx.actor === null ? null : `${ctx.actor.kind}:${ctx.actor.name}`);

// Records every service call, then applies the hooks a test armed: an armed
// hold delays the call until the test releases it, and an armed failure
// throws the declared error in place of the service.
const recording = (inner: ServiceTransport, calls: Call[], hooks: Hooks): ServiceTransport => ({
	start: inner.start,
	close: inner.close,
	call: async (name, ctx, input, timing) => {
		calls.push({ path: name.split("."), input, actor: actorHeader(ctx) });
		const hold = hooks.takeHold(name);
		if (hold !== undefined) await hold;
		const failure = hooks.takeFailure(name);
		if (failure !== undefined) throw fail(failure.code, failure.data as never);
		return inner.call(name, ctx, input, timing);
	},
});

// Writes the blob of every seeded attachment into a fresh home. The bytes
// follow from the mime and the size, so the file under each hash is the one
// the seed uploaded.
const writeSeedBlobs = async (home: string, rows: unknown[]) => {
	for (const row of rows as Array<{ sha256: string; mime: string; size: number }>) {
		const path = blobPath(home, row.sha256);
		mkdirSync(dirname(path), { recursive: true });
		await Bun.write(path, attachmentBytes(row.mime, row.size));
	}
};

// Every server of this test file shares one database, so only one is built at
// a time. A build empties the database first, which is why the chain is here
// and not inside one server.
let chain: Promise<unknown> = Promise.resolve();

const open = new Set<TestApp>();

const build = async (options: TestServerOptions, calls: Call[], hooks: Hooks) => {
	const h = await sharedDb();
	const snapshot = await seedSnapshot();
	const app = await createTestApp({
		db: h,
		maxUploadMb: (options.maxUploadBytes ?? defaultMaxUploadBytes) / (1024 * 1024),
		ghStatus: () => options.gh ?? missingGh,
		addresses: async () => options.addresses ?? ["http://192.168.1.20:4521", "http://127.0.0.1:4521"],
		wrapTransport: (inner) => recording(inner, calls, hooks),
	});
	if (options.empty === true) {
		await restore(h.db, { tables: {}, nextActivityId: 1 });
		await app.transport.start();
	} else {
		await restore(h.db, snapshot, Date.now() - snapshot.base);
		await writeSeedBlobs(app.home, snapshot.tables.attachments ?? []);
		// The project cache was loaded before the restore, so it is rebuilt here.
		await app.transport.start();
		await seedDoneToday(app.transport);
	}
	open.add(app);
	return app;
};

export type TestServer = ReturnType<typeof createTestServer>;

// A test server the moment a test asks for one. The build runs behind the
// first call, so a test that needs no await keeps the call site it had.
export const createTestServer = (options: TestServerOptions = {}) => {
	const calls: Call[] = [];
	const hooks = createHooks();
	const ready = (chain = chain.then(() => build(options, calls, hooks))) as Promise<TestApp>;
	// A build that fails reaches the test through the first call; this keeps
	// the process from reporting an unhandled rejection first.
	ready.catch(() => undefined);
	const fetch: FetchLike = async (request, init) => (await ready).app.request(request, init);
	const clientAs = (actor: string): TrellisClient => createTrellisClient(origin, actor, fetch);
	return {
		ready,
		fetch,
		client: clientAs("human:navid"),
		clientAs,
		calls,
		failNext: hooks.failNext,
		holdNext: hooks.holdNext,
		// The calls to one service, by its dotted name.
		callsTo: (path: string) => calls.filter((call) => call.path.join(".") === path),
		// The event bus the server emits on, for a test that drives a live frame.
		bus: async () => (await ready).bus,
		bootId: async () => (await ready).bootId,
		request: async (input: Request | string, init?: RequestInit) => (await ready).app.request(input, init),
		shutdown: async () => {
			await (await ready).bye("shutdown");
		},
	};
};

// Closes every server this test file built. The preloaded cleanup file calls
// it after each test.
export const closeTestServers = async () => {
	const apps = [...open];
	open.clear();
	for (const app of apps) await app.close();
};
