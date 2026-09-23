import { afterAll, beforeAll } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { nativeWorkspace } from "../agents/native/workspace.ts";
import type { startNative } from "../services/agentRuns/nativeStart.ts";
import type { IoCtx } from "../services/support.ts";
import { createCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { openTestDb } from "./testDb.ts";

const exec = promisify(execFile);
let db: Db;
let home: string;
let repo: string;
let ctx: IoCtx;
const projectId = ulid();
const ticketId = ulid();
const launches: Parameters<typeof startNative>[1][] = [];
const backgroundTasks: Promise<void>[] = [];
const drainBackground = async () => {
	await Promise.all(backgroundTasks.splice(0));
};
const harness = HarnessSchema.parse({ preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" });
const git = async (directory: string, ...args: string[]) =>
	(await exec("git", ["-C", directory, ...args])).stdout.trim();
const start: typeof startNative = async (ctx, input) => {
	launches.push(input);
	const workspace = await nativeWorkspace(ctx.home, input.run, input.config.directory);
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET workspace_id=${workspace},session_id='saved-conversation' WHERE id=${input.run.id}`,
		),
	);
	return { id: input.run.id };
};

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-project-sessions-test-"));
	repo = join(home, "repository");
	await mkdir(repo);
	await git(repo, "init", "-q", "-b", "main");
	await writeFile(join(repo, "source.txt"), "original\n");
	await git(repo, "add", ".");
	await git(repo, "-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-qm", "Base");
	db = await openTestDb();
	const at = new Date();
	const statusId = ulid();
	await db.execute(sql`INSERT INTO projects (id,root_id,key,slug,name,directory,created_at,updated_at)
 VALUES (${projectId},${projectId},'TST','test','Test',${repo},${at},${at})`);
	await db.execute(sql`INSERT INTO statuses (id,project_id,name,slug,category,color,position,is_default,created_at,updated_at)
 VALUES (${statusId},${projectId},'Todo','todo','todo','fg-muted',0,true,${at},${at})`);
	await db.execute(sql`INSERT INTO tickets (id,project_id,root_id,number,title,status_id,position,created_at,updated_at)
 VALUES (${ticketId},${projectId},${projectId},1,'Task',${statusId},0,${at},${at})`);
	const cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const actor = { name: "Test", kind: "human" as const };
	ctx = {
		actor,
		session: null,
		home,
		maxUploadBytes: 1024,
		version: "test",
		apiVersion: "test",
		bootId: "test",
		now: () => at,
		ghStatus: () => {
			throw new Error("No GitHub request in this test.");
		},
		addresses: async () => [],
		log: () => undefined,
		emit: () => {},
		afterCommit: () => {},
		background: (task) => {
			backgroundTasks.push(task(ctx));
		},
		newTx: (fn) => db.transaction(fn),
		vacuum: async () => {},
		localUrl: "http://localhost:4597",
		publicUrl: "http://localhost:4597",
		core: {
			actor,
			session: null,
			reqId: ulid(),
			now: at,
			cache,
			actorCache: new Map(),
			emit: () => {},
			dropBlobs: () => {},
			publicUrl: "http://localhost:4597",
		},
	};
});
afterAll(async () => {
	await drainBackground();
	await db?.$client.close();
	if (home) await rm(home, { recursive: true, force: true });
});

export { ctx, db, drainBackground, git, harness, home, launches, projectId, repo, start, ticketId };
