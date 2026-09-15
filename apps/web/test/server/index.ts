import { afterEach } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createTrellisClient, type FetchLike, type GhStatus, type TrellisClient } from "@trellis/api";
import { ulid } from "ulid";
import type { RequestContext } from "../../../server/src/context.ts";
import type { ServiceTransport } from "../../../server/src/db/transport.ts";
import { fail } from "../../../server/src/errors.ts";
import { createGhRunner, type GhResult, type GhRunner } from "../../../server/src/gh/run.ts";
import { blobPath } from "../../../server/src/storage/blobs.ts";
import { createTestApp, type TestApp } from "../../../server/test/helpers/app.ts";
import { ghStub } from "../../../server/test/helpers/gh-stub.ts";
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
	// The folder the machine's picker answers with. `null` is a canceled
	// dialog, which is the default.
	directory?: string | null;
	// Writes a test needs before the first render, through the same client the
	// page uses. The calls it makes are not recorded, so a test still counts
	// the calls its own render made.
	prepare?: (client: TrellisClient) => Promise<void>;
};

export const defaultMaxUploadBytes = 50 * 1024 * 1024;

// The origin the test clients address. `app.request` reads the path only.
const origin = "http://trellis.local";

// The script that stands in for the gh binary.
const GH_STUB_BIN = join(import.meta.dir, "..", "..", "..", "server", "test", "stubs", "gh.ts");

const missingGh: GhStatus = {
	ok: false,
	user: null,
	reason: "missing",
	message: "trellis did not find the gh binary. Install gh, or set TRELLIS_GH_BIN.",
	checkedAt: null,
};

// What `gh auth status` answers for the state a test set. The server reads
// the state from that one command, so a test sets the state and the real
// service turns it into the banner.
const authResult = (status: GhStatus): GhResult =>
	status.ok
		? {
				ok: true,
				code: 0,
				stdout: `github.com\n  Logged in to github.com account ${status.user} (keyring)\n`,
				stderr: "",
			}
		: status.reason === "missing" || status.reason === "unauthenticated"
			? { ok: false, reason: status.reason, message: status.message ?? "" }
			: { ok: false, reason: "error", message: status.message ?? "gh did not answer.", code: 1, stdout: "" };

// The runner the app spawns, with `auth status` answered in the process. A
// pull request fetch still reaches the gh stub, so a poll and a refresh run
// the real command path.
const ghRunner = (inner: GhRunner, gh: GhHolder): GhRunner =>
	Object.assign(
		(slot: Parameters<GhRunner>[0], args: string[]) =>
			args[0] === "auth" && args[1] === "status" ? Promise.resolve(authResult(gh.status)) : inner(slot, args),
		{ bin: inner.bin, timeoutMs: inner.timeoutMs },
	);

// The `x-trellis-actor` header of the request one call belongs to, by the
// request id the fetch wrapper set. A read carries no actor in its service
// context, and a test still proves which identity the client sent.
const actorOfRequest = new Map<string, string | null>();

const actorHeader = (ctx: RequestContext) =>
	actorOfRequest.get(ctx.reqId) ?? (ctx.actor === null ? null : `${ctx.actor.kind}:${ctx.actor.name}`);

// Records every service call, then applies the hooks a test armed: an armed
// hold delays the call until the test releases it, and an armed failure
// throws the declared error in place of the service.
const recording = (inner: ServiceTransport, calls: Call[], hooks: Hooks): ServiceTransport => ({
	start: inner.start,
	close: inner.close,
	settle: inner.settle,
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

// The servers this test built. Each one closes after the test, which drains
// the calls still in flight. A closed server then refuses every further
// request, so a write a page left on a timer never reaches the database the
// next test seeded.
type Live = { app: TestApp; closed: boolean };

const open: Live[] = [];

afterEach(async () => {
	for (const live of open.splice(0)) {
		live.closed = true;
		await live.app.close();
	}
	// A request the page left in flight settles here, so its answer never
	// reaches the next test.
	await new Promise((resolve) => setTimeout(resolve, 0));
});

const CLOSED = () =>
	new Response(
		'{"json":{"defined":false,"code":"SERVICE_UNAVAILABLE","status":503,"message":"The test server is closed."}}',
		{ status: 503, headers: { "content-type": "application/json" } },
	);

// The process state one server reports: what gh says, what URLs the listener
// answers on, and what the folder picker returns. A test changes any of them
// after the build, and the next read answers with the new value.
type GhHolder = { status: GhStatus; addresses: string[]; directory: string | null };

// The folder picker of the machine, for a test. `system.chooseDirectory` runs
// in the procedure and not in a service, so this records the call and applies
// the hooks the way the transport wrapper does for every other name.
const folderPicker = (calls: Call[], hooks: Hooks, gh: GhHolder) => async () => {
	const name = "system.chooseDirectory";
	calls.push({ path: name.split("."), input: {}, actor: null });
	const hold = hooks.takeHold(name);
	if (hold !== undefined) await hold;
	const failure = hooks.takeFailure(name);
	if (failure !== undefined) throw fail(failure.code, failure.data as never);
	return gh.directory;
};

const build = async (options: TestServerOptions, calls: Call[], hooks: Hooks, gh: GhHolder) => {
	// A server of an earlier test is closed first, so no write of its own is
	// still on the way to the database this build is about to empty.
	for (const live of open.splice(0)) {
		live.closed = true;
		await live.app.close();
	}
	const h = await sharedDb();
	const snapshot = await seedSnapshot();
	// The gh runner reads TRELLIS_GH_BIN when it is built, and the stub reads
	// its replies file at every spawn, so the three variables stay set for the
	// life of this server. The next build overwrites them with its own.
	const dir = mkdtempSync(`${process.env.TRELLIS_HOME}/stubs-`);
	const stub = ghStub(dir, {});
	// The runner spawns this copy of the gh stub. A test deletes it to prove
	// what the page shows when gh is not on the machine, so each build copies
	// the stub itself and never the copy a previous build made.
	const ghBin = join(dir, "gh");
	copyFileSync(GH_STUB_BIN, ghBin);
	chmodSync(ghBin, 0o755);
	process.env.TRELLIS_GH_BIN = ghBin;
	const app = await createTestApp({
		db: h,
		gh: ghRunner(createGhRunner(), gh),
		maxUploadMb: (options.maxUploadBytes ?? defaultMaxUploadBytes) / (1024 * 1024),
		ghStatus: () => gh.status,
		addresses: async () => gh.addresses,
		wrapTransport: (inner) => recording(inner, calls, hooks),
		chooseDirectory: folderPicker(calls, hooks, gh),
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
	const live: Live = { app, closed: false };
	open.push(live);
	if (options.prepare !== undefined) await options.prepare(app.client);
	calls.length = 0;
	return { app, live, stub, ghBin };
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
		directory: options.directory ?? null,
	};
	const ready = chain.then(() => build(options, calls, hooks, gh));
	chain = ready;
	// A build that fails reaches the test through the first call; this keeps
	// the process from reporting an unhandled rejection first.
	ready.catch(() => undefined);
	// Every request carries a request id, so the calls it makes are recorded
	// with the identity the client sent.
	const fetch: FetchLike = async (request, init) => {
		const reqId = ulid();
		const headers = new Headers(request.headers);
		headers.set("x-request-id", reqId);
		actorOfRequest.set(reqId, request.headers.get("x-trellis-actor"));
		const { app, live } = await ready;
		if (live.closed) return CLOSED();
		return app.app.request(new Request(request, { headers }), init);
	};
	const clientAs = (actor: string): TrellisClient => createTrellisClient(origin, actor, fetch);
	return {
		ready,
		fetch,
		client: clientAs("human:dana"),
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
		// The folder the picker answers with from the next call on. `null` is
		// a canceled dialog.
		setDirectory: (directory: string | null) => {
			gh.directory = directory;
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
		// Takes the gh binary off the machine, so every gh call answers with
		// the reason `missing`.
		removeGh: async () => {
			rmSync((await ready).ghBin, { force: true });
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
