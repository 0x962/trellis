import { expect, test } from "bun:test";
import { SessionCreateInputSchema, SessionRenameInputSchema, SessionSchema } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { getRun } from "../services/agentRuns/queries.ts";
import { prepareCreate } from "../services/sessions/create.ts";
import { getSession, resolveSession } from "../services/sessions/queries.ts";
import { rename } from "../services/sessions/rename.ts";
import { prepareStart } from "../services/sessions/start.ts";
import { ctx, db, drainBackground, harness, launches, start } from "./projectSessionsFixture.ts";

test.each([undefined, "TST"])("create, rename, and resume preserve a long name in project %s", async (project) => {
	const name = "Complete session name ".repeat(100).trim();
	const input = SessionCreateInputSchema.parse({ project, name, prompt: "Inspect", harness });
	const created = await prepareCreate(ctx, input, start);
	await drainBackground();
	const session = SessionSchema.parse(await db.transaction((tx) => getSession(tx, created.id)));
	const before = await db.transaction((tx) => getRun(tx, session.runId));
	expect(session.name).toBe(name);
	expect(before.name).toBe(name);
	expect(before.sessionId).toBe("saved-conversation");
	const renamedName = `Complete renamed ${project ?? "standalone"} session ${"界".repeat(4096)}`;
	const renamed = await db.transaction((tx) =>
		rename(ctx.core, tx, SessionRenameInputSchema.parse({ id: session.id, name: renamedName })),
	);
	expect(renamed).toEqual({ ...session, name: renamedName });
	expect((await db.transaction((tx) => resolveSession(tx, renamedName))).id).toBe(session.id);
	const saved = await db.transaction((tx) => getRun(tx, session.runId));
	expect(saved.name).toBe(renamedName);
	expect(saved.sessionId).toBe(before.sessionId);
	expect(saved.workspaceId).toBe(before.workspaceId);
	expect(saved.terminalId).toBe(before.terminalId);
	const count = launches.length;
	await prepareStart(
		ctx,
		{ id: session.id },
		{
			process: async () => ({ status: "exited", agent: { sessionId: saved.sessionId } }) as RuntimeProcessStatus,
			preset: async () => "codex",
			start,
		},
	);
	await drainBackground();
	expect(launches.length).toBe(count + 1);
	expect(launches.at(-1)!.resume).toBe(true);
	expect(launches.at(-1)!.run.sessionId).toBe(before.sessionId);
	const resumed = await db.transaction((tx) => getRun(tx, session.runId));
	expect(resumed.sessionId).toBe(before.sessionId);
	expect(resumed.workspaceId).toBe(before.workspaceId);
	expect(resumed.terminalId).not.toBe(before.terminalId);
	expect((await db.transaction((tx) => getSession(tx, session.id))).name).toBe(renamedName);
});

test("duplicate long names keep separate identities and unique run associations", async () => {
	const name = "A complete shared name ".repeat(100).trim();
	const input = SessionCreateInputSchema.parse({ name, prompt: "Inspect", harness });
	const first = await prepareCreate(ctx, input, start);
	const second = await prepareCreate(ctx, input, start);
	await drainBackground();
	const one = await db.transaction((tx) => getSession(tx, first.id));
	const two = await db.transaction((tx) => getSession(tx, second.id));
	expect(one.name).toBe(name);
	expect(two.name).toBe(name);
	expect(one.id).not.toBe(two.id);
	expect(one.runId).not.toBe(two.runId);
	expect(one.directory).not.toBe(two.directory);
	await expect(db.transaction((tx) => resolveSession(tx, name))).rejects.toThrow("More than one session matches");
	await expect(db.execute(sql`UPDATE sessions SET run_id = ${one.runId} WHERE id = ${two.id}`)).rejects.toThrow();
	for (const invalid of ["", " padded "]) {
		await expect(db.execute(sql`UPDATE sessions SET name = ${invalid} WHERE id = ${one.id}`)).rejects.toThrow();
	}
	expect((await db.transaction((tx) => getSession(tx, one.id))).name).toBe(name);
});
