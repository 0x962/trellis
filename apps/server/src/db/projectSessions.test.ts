import { expect, test } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SessionCreateInputSchema } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { activityRows } from "../services/agentRuns/activity.ts";
import { seen } from "../services/agentRuns/attention.ts";
import { getRun } from "../services/agentRuns/queries.ts";
import { reserve } from "../services/agentRuns/reserve.ts";
import { prepareCreate } from "../services/sessions/create.ts";
import { getSession, listSessions } from "../services/sessions/queries.ts";
import { prepareDelete } from "../services/sessions/remove.ts";
import { prepareStart } from "../services/sessions/start.ts";
import {
	ctx,
	db,
	drainBackground,
	git,
	harness,
	home,
	launches,
	projectId,
	repo,
	start,
	ticketId,
} from "./projectSessionsFixture.ts";

const attachmentRequestId = crypto.randomUUID();
test("project sessions and ticket agents use the same isolated workspace primitive", async () => {
	const result = await prepareCreate(ctx, { project: "TST", name: "plan", prompt: "Read the source", harness }, start);
	await drainBackground();
	const session = await db.transaction((tx) => getSession(tx, result.id));
	const run = await db.transaction((tx) => getRun(tx, session.runId));
	expect(session.projectId).toBe(projectId);
	expect(session.projectPath).toBe("TST");
	expect(run.kind).toBe("session");
	expect(session.harness).toEqual(harness);
	expect(run.harness).toEqual(harness);
	expect(run.workspaceId).toBe(join(home, "agents", run.id, "work"));
	expect(await readFile(join(run.workspaceId!, "source.txt"), "utf8")).toBe("original\n");
	await writeFile(join(run.workspaceId!, "source.txt"), "changed\n");
	expect(await readFile(join(repo, "source.txt"), "utf8")).toBe("original\n");
	const ticket = await db.transaction((tx) => reserve(ctx.core, tx, { ticket: "TST-1", harness }));
	if (ticket.replay) throw new Error("Expected a new ticket assignment.");
	await start(ctx, ticket);
	expect(ticket.run.ticketIdentifier).toBe("TST-1");
	expect(await git(repo, "worktree", "list", "--porcelain")).toContain(join(home, "agents", ticket.run.id, "work"));
	const assigned = await db.transaction((tx) => getRun(tx, ticket.run.id));
	expect(assigned).toMatchObject({ projectId, ticketId, ticketTitle: "Task", ticketStatusCategory: "todo" });
	// The saved instruction names the branch that the worktree is on.
	const branch = await git(assigned.workspaceId!, "branch", "--show-current");
	expect(branch).toBe(`trellis/tst-1-${ticket.run.id.toLowerCase()}`);
	expect(assigned.instruction).toStartWith(
		`# TST-1: Task\n\n- Project: TST\n- Branch: ${branch}\n- URL: http://localhost:4597/t/TST-1\n\n## Assignment`,
	);
});

test("concurrent create requests launch once and bind the request to file bytes", async () => {
	const requestId = attachmentRequestId;
	const input = {
		project: "TST",
		name: "with-files",
		prompt: "Read the files",
		harness,
		requestId,
		files: [new File(["first"], "../note.txt")],
	};
	const count = launches.length;
	const [one, two] = await Promise.all([prepareCreate(ctx, input, start), prepareCreate(ctx, input, start)]);
	await drainBackground();
	expect(one.id).toBe(two.id);
	expect(launches.length - count).toBe(1);
	const launch = launches.at(-1)!;
	const attachment = JSON.parse(launch.run.instruction.split("\n").at(-1)!);
	expect(attachment).toStartWith(join(home, "agents", launch.run.id, "attachments"));
	expect(await readFile(attachment, "utf8")).toBe("first");
	await expect(prepareCreate(ctx, { ...input, files: [new File(["other"], "../note.txt")] }, start)).rejects.toThrow(
		"different assignment",
	);
	await expect(prepareCreate(ctx, { ...input, prompt: "Changed" }, start)).rejects.toThrow("different assignment");
});

test("concurrent names and project inheritance retain distinct sessions", async () => {
	const child = ulid();
	const at = ctx.now();
	await db.execute(
		sql`INSERT INTO projects (id,parent_id,root_id,slug,name,created_at,updated_at) VALUES (${child},${projectId},${projectId},'child','Child',${at},${at})`,
	);
	await db.transaction((tx) => ctx.core.cache.rebuild(tx));
	const input = { project: "TST.child", name: "same-name", prompt: "Inspect", harness };
	const sessions = await Promise.all([prepareCreate(ctx, input, start), prepareCreate(ctx, input, start)]);
	await drainBackground();
	const rows = await Promise.all(sessions.map(({ id }) => db.transaction((tx) => getSession(tx, id))));
	expect(new Set(rows.map((row) => row.name)).size).toBe(2);
	expect(rows.every((row) => row.projectId === child)).toBe(true);
	expect(await readFile(join(rows[0]!.directory, "source.txt"), "utf8")).toBe("original\n");
});

test("resume races keep one attempt, the workspace, effort, and conversation", async () => {
	const session = (await db.transaction(listSessions)).find((row) => row.name === "plan")!;
	const before = await db.transaction((tx) => getRun(tx, session.runId));
	const process = async () =>
		({
			status: "exited",
			launch: { cwd: before.workspaceId },
			agent: { sessionId: before.sessionId },
		}) as RuntimeProcessStatus;
	const count = launches.length;
	const results = await Promise.allSettled([
		prepareStart(ctx, { id: session.id }, { process, start, preset: async () => "codex" }),
		prepareStart(ctx, { id: session.id }, { process, start, preset: async () => "codex" }),
	]);
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(launches.length - count).toBe(1);
	const after = await db.transaction((tx) => getRun(tx, session.runId));
	expect(after.terminalId).not.toBe(before.terminalId);
	expect(after.workspaceId).toBe(before.workspaceId);
	expect(after.sessionId).toBe(before.sessionId);
	expect(after.harness).toEqual(harness);
	expect(launches.at(-1)!.config.harness).toEqual(harness);
	expect(launches.at(-1)!.resume).toBe(true);
	expect(await readFile(join(after.workspaceId!, "source.txt"), "utf8")).toBe("changed\n");
});

test("unconfirmed processes block resume and failed stops retain the workspace", async () => {
	const session = (await db.transaction(listSessions))[0]!;
	const process = async () => ({ status: "unknown" }) as RuntimeProcessStatus;
	await expect(prepareStart(ctx, { id: session.id }, { process, start, preset: async () => "codex" })).rejects.toThrow(
		"confirm it exited",
	);
	await expect(
		prepareDelete(
			ctx,
			{ id: session.id },
			{
				process,
				stop: async () => {
					throw new Error("Stop unconfirmed");
				},
			},
		),
	).rejects.toThrow("Stop unconfirmed");
	expect((await db.transaction((tx) => getSession(tx, session.id))).id).toBe(session.id);
	expect((await stat(session.directory)).isDirectory()).toBe(true);
});

test("delete removes the Git worktree registration and retains the repository and run", async () => {
	const session = (await db.transaction(listSessions)).find((row) => row.name === "with-files")!;
	await prepareDelete(
		ctx,
		{ id: session.id },
		{
			process: async () => ({ status: "exited" }) as RuntimeProcessStatus,
			stop: async () => {
				throw new Error("Unexpected stop");
			},
		},
	);
	expect(await git(repo, "worktree", "list", "--porcelain")).not.toContain(session.directory);
	expect(await Bun.file(join(repo, "source.txt")).text()).toBe("original\n");
	expect((await db.transaction((tx) => getRun(tx, session.runId))).closedAt).not.toBeNull();
	await expect(db.transaction((tx) => getSession(tx, session.id))).rejects.toThrow();
	await expect(
		prepareCreate(
			ctx,
			{
				project: "TST",
				name: "with-files",
				prompt: "Read the files",
				harness,
				requestId: attachmentRequestId,
				files: [new File(["first"], "../note.txt")],
			},
			start,
		),
	).rejects.toThrow("deleted session");
});

test("file-only prompts work and invalid launch choices fail before allocation", async () => {
	expect(SessionCreateInputSchema.safeParse({ prompt: "", files: [new File(["hello"], "note.txt")] }).success).toBe(
		true,
	);
	expect(SessionCreateInputSchema.safeParse({ prompt: "" }).success).toBe(false);
	expect(
		SessionCreateInputSchema.safeParse({ prompt: "hello", harness: { preset: "claude", model: "openai/gpt-5.6-sol" } })
			.success,
	).toBe(false);
	const count = (await db.transaction(listSessions)).length;
	await expect(
		prepareCreate(
			ctx,
			{ project: "TST", prompt: "Read", files: [new File([new Uint8Array(1025)], "large.bin")] },
			start,
		),
	).rejects.toThrow();
	expect((await db.transaction(listSessions)).length).toBe(count);
});

test("scratch session retries retain one repository and one launch", async () => {
	const input = { name: "scratch", prompt: "Inspect", harness, requestId: crypto.randomUUID() };
	const count = launches.length;
	const [one, two] = await Promise.all([prepareCreate(ctx, input, start), prepareCreate(ctx, input, start)]);
	await drainBackground();
	expect(one.id).toBe(two.id);
	expect(launches.length - count).toBe(1);
	const session = await db.transaction((tx) => getSession(tx, one.id));
	expect(session.projectId).toBeNull();
	expect((await db.transaction((tx) => getRun(tx, session.runId))).harness).toEqual(harness);
	expect(await git(session.directory, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
});

test("delete cannot remove a worktree while resume prepares a process", async () => {
	const session = (await db.transaction(listSessions)).find((row) => row.name === "plan")!;
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const resume = prepareStart(
		ctx,
		{ id: session.id },
		{
			process: async () => {
				entered.resolve();
				await release.promise;
				return { status: "exited", launch: null } as RuntimeProcessStatus;
			},
			start,
			preset: async () => "codex",
		},
	);
	await entered.promise;
	await expect(prepareDelete(ctx, { id: session.id })).rejects.toThrow("operation is in progress");
	release.resolve();
	await resume;
	expect((await stat(session.directory)).isDirectory()).toBe(true);
});

test("file preparation failures do not publish a pending session", async () => {
	const badHome = join(home, "bad-home");
	await mkdir(badHome);
	await writeFile(join(badHome, "agents"), "not a directory");
	const count = (await db.transaction(listSessions)).length;
	await expect(
		prepareCreate(
			{ ...ctx, home: badHome },
			{ project: "TST", prompt: "Read", files: [new File(["data"], "test.txt")] },
			start,
		),
	).rejects.toThrow();
	expect((await db.transaction(listSessions)).length).toBe(count);
});

test("archived projects reject session creation", async () => {
	await db.execute(sql`UPDATE projects SET archived_at=${ctx.now()} WHERE id=${projectId}`);
	await db.transaction((tx) => ctx.core.cache.rebuild(tx));
	const count = launches.length;
	await expect(prepareCreate(ctx, { project: "TST", prompt: "Inspect", harness }, start)).rejects.toThrow();
	expect(launches).toHaveLength(count);
});

test("completion acknowledgement is monotonic and rejects a replaced attempt", async () => {
	const result = await prepareCreate(ctx, { name: "ack-test", prompt: "Inspect", harness }, start);
	await drainBackground();
	const session = await db.transaction((tx) => getSession(tx, result.id));
	const run = await db.transaction((tx) => getRun(tx, session.runId));
	await db.transaction((tx) => seen(ctx, tx, { id: run.id, attemptId: run.terminalId, sequence: 8 }));
	await db.transaction((tx) => seen(ctx, tx, { id: run.id, attemptId: run.terminalId, sequence: 4 }));
	expect((await db.transaction((tx) => getRun(tx, run.id))).seenAttention).toEqual({
		attemptId: run.terminalId,
		sequence: 8,
	});
	await db.execute(sql`UPDATE agent_runs SET terminal_id='replacement' WHERE id=${run.id}`);
	await expect(
		db.transaction((tx) => seen(ctx, tx, { id: run.id, attemptId: run.terminalId, sequence: 9 })),
	).rejects.toThrow();
	await db.transaction((tx) => seen(ctx, tx, { id: run.id, attemptId: "replacement", sequence: 2 }));
	expect((await db.transaction((tx) => getRun(tx, run.id))).seenAttention).toEqual({
		attemptId: "replacement",
		sequence: 2,
	});
});

test("alert activity includes ticket agents and sessions but excludes flow agents", async () => {
	const sessions = await db.transaction(listSessions);
	const entries = await db.transaction(activityRows);
	const ticketRun = entries.find((run) => run.ticketId === ticketId)!;
	expect(ticketRun.kind).toBe("agent");
	expect(ticketRun.activitySessionId).toBeNull();
	const standalone = sessions.find((entry) => entry.name === "scratch")!;
	expect(entries.find((run) => run.id === standalone.runId)!.activitySessionId).toBe(standalone.id);
	await db.execute(sql`UPDATE agent_runs SET kind='flow' WHERE id=${ticketRun.id}`);
	expect((await db.transaction(activityRows)).some((run) => run.id === ticketRun.id)).toBe(false);
	expect((await db.transaction((tx) => getRun(tx, ticketRun.id))).kind).toBe("flow");
	await db.execute(sql`UPDATE agent_runs SET kind='agent' WHERE id=${ticketRun.id}`);
	await db.execute(sql`UPDATE agent_runs SET closed_at=${ctx.now()} WHERE id=${ticketRun.id}`);
	expect((await db.transaction(activityRows)).some((run) => run.id === ticketRun.id)).toBe(false);
});
