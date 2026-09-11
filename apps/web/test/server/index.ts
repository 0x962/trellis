import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createTrellisClient, type FetchLike, type GhStatus, type TrellisClient } from "@trellis/api";
import type { RequestContext } from "../../../server/src/context.ts";
import type { InlineTransport, ServiceTransport } from "../../../server/src/db/transport.ts";
import { fail } from "../../../server/src/errors.ts";
import { blobPath } from "../../../server/src/storage/blobs.ts";
import { createTestApp } from "../../../server/test/helpers/app.ts";
import { fakeTimerClock } from "../../../server/test/helpers/clock.ts";
import { ghStub } from "../../../server/test/helpers/gh-stub.ts";
import { SUPERSET_STUB_BIN, supersetStub } from "../../../server/test/helpers/superset-stub.ts";
import { seedSnapshot } from "./cache.ts";
import { sharedDb } from "./db.ts";
import { createHooks, type Hooks } from "./hooks.ts";
import { attachmentBytes, type PrSpec, prReplyBody } from "./seed/support.ts";
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
	// Writes a test needs before the first render, through the same client the
	// page uses. The calls it makes are not recorded, so a test still counts
	// the calls its own render made.
	prepare?: (client: TrellisClient) => Promise<void>;
};

export const defaultMaxUploadBytes = 50 * 1024 * 1024;

// The origin the test clients address. `app.request` reads the path only.
const origin = "http://trellis.local";

// The Superset projects `agents.runnerProjects` lists.
const RUNNER_PROJECTS = [
	{ id: "sp-de", name: "de", repo: "canary-technologies-corp/de", path: "/Users/navid/projects/de" },
	{ id: "sp-trellis", name: "trellis", repo: "0x962/trellis", path: "/Users/navid/projects/trellis" },
];

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

// The process state one server reports: what gh says and what URLs the
// listener answers on. A test changes either after the build, and the next
// read answers with the new value.
type GhHolder = { status: GhStatus; addresses: string[] };

const build = async (options: TestServerOptions, calls: Call[], hooks: Hooks, gh: GhHolder) => {
	const h = await sharedDb();
	const snapshot = await seedSnapshot();
	// The gh runner reads TRELLIS_GH_BIN when it is built, and the stub reads
	// its replies file at every spawn, so the three variables stay set for the
	// life of this server. The next build overwrites them with its own.
	const dir = mkdtempSync(`${process.env.TRELLIS_HOME}/stubs-`);
	const stub = ghStub(dir, {});
	// The agents runner spawns this copy of the superset stub. A test deletes
	// it to prove what the page shows when the CLI is not on the machine.
	const supersetBin = join(dir, "superset");
	copyFileSync(SUPERSET_STUB_BIN, supersetBin);
	chmodSync(supersetBin, 0o755);
	const superset = supersetStub(dir, { projects: RUNNER_PROJECTS });
	const app = await createTestApp({
		db: h,
		supersetBin,
		maxUploadMb: (options.maxUploadBytes ?? defaultMaxUploadBytes) / (1024 * 1024),
		ghStatus: () => gh.status,
		addresses: async () => gh.addresses,
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
	if (options.prepare !== undefined) await options.prepare(app.client);
	calls.length = 0;
	return { app, stub, superset, supersetBin };
};

export type TestServer = ReturnType<typeof createTestServer>;

// A test server the moment a test asks for one. The build runs behind the
// first call, so a test that needs no await keeps the call site it had.
export const createTestServer = (options: TestServerOptions = {}) => {
	const calls: Call[] = [];
	const hooks = createHooks();
	const gh: GhHolder = {
		status: options.gh ?? missingGh,
		addresses: options.addresses ?? ["http://192.168.1.20:4521", "http://127.0.0.1:4521"],
	};
	const ready = chain.then(() => build(options, calls, hooks, gh));
	chain = ready;
	// A build that fails reaches the test through the first call; this keeps
	// the process from reporting an unhandled rejection first.
	ready.catch(() => undefined);
	const fetch: FetchLike = async (request, init) => (await ready).app.app.request(request, init);
	const clientAs = (actor: string): TrellisClient => createTrellisClient(origin, actor, fetch);
	return {
		ready,
		fetch,
		client: clientAs("human:navid"),
		clientAs,
		calls,
		// What `system.gh` reports from the next read on.
		setGh: (status: GhStatus) => {
			gh.status = status;
		},
		// The URLs `system.health` lists from the next read on.
		setAddresses: (addresses: string[]) => {
			gh.addresses = addresses;
		},
		failNext: hooks.failNext,
		holdNext: hooks.holdNext,
		// The calls to one service, by its dotted name.
		callsTo: (path: string) => calls.filter((call) => call.path.join(".") === path),
		// The event bus the server emits on, for a test that drives a live frame.
		bus: async () => (await ready).app.bus,
		bootId: async () => (await ready).app.bootId,
		home: async () => (await ready).app.home,
		request: async (input: Request | string, init?: RequestInit) => (await ready).app.app.request(input, init),
		// The agents host, on a clock the test moves. It watches every enabled
		// project, batches the changes it sees, and wakes the managers.
		startAgents: async () => {
			const { app } = await ready;
			const clock = fakeTimerClock(new Date());
			const host = (app.transport as InlineTransport).startAgents({ clock, log: () => {} });
			await host.start();
			return { host, clock };
		},
		// The state of the fake superset the agents runner spawns.
		superset: async () => (await ready).superset,
		// Takes the superset binary off the machine, so every runner call
		// answers RUNNER_UNAVAILABLE with the reason `missing`.
		removeSuperset: async () => {
			rmSync((await ready).supersetBin, { force: true });
		},
		// The answer the gh stub gives the next pull request fetch.
		armPr: async (pr: PrSpec) => {
			const { stub } = await ready;
			stub.reply("api graphql", { stdout: JSON.stringify(prReplyBody(pr)), stderr: "", exitCode: 0 });
		},
		shutdown: async () => {
			await (await ready).app.bye("shutdown");
		},
	};
};
