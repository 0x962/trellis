import { afterEach, expect, test } from "bun:test";
import { createTrellisClient } from "@trellis/api/client";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { reserveAttempt } from "../../../../src/services/assignments/attempts.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("worker brief, health and local review access uses the host token and fences expired mutations", async () => {
	t = await createTestApp({ authToken: "host-token" });
	const client = (actor: string, hostToken?: string, attemptToken?: string) =>
		createTrellisClient("http://trellis.test", actor, (request) => {
			if (hostToken !== undefined) request.headers.set("authorization", `Bearer ${hostToken}`);
			if (attemptToken !== undefined) request.headers.set("x-trellis-attempt", attemptToken);
			return Promise.resolve(t.app.request(request));
		});
	const human = client("human:navid", "host-token");
	const project = await human.projects.create({ key: "AUTH", name: "Agent authorization" });
	const ticket = await human.tickets.create({ project: "AUTH", title: "Assigned work" });
	const runId = ulid();
	const attempt = await t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,ticket_id,created_at,updated_at)
			VALUES (${runId},'Reviewer','native','Reviewer','reviewer','Review',${project.id},'AUTH',${ticket.id},now(),now())`);
		const attempt = await reserveAttempt({ now: new Date() }, tx, { runId });
		await tx.execute(sql`UPDATE agent_runs SET terminal_id=${attempt.id} WHERE id=${runId}`);
		return attempt;
	});
	const thread = await human.reviews.add({ pr: "owner/repo#17", path: "file.ts", line: 1, body: "Check this." });
	const worker = client(`agent:${runId}`, "host-token", attempt.token);
	await expect(worker.brief.get({ ticket: ticket.identifier })).resolves.toBeDefined();
	await expect(worker.system.health({})).resolves.toBeDefined();
	expect((await worker.reviews.list({ pr: "owner/repo#17" })).items[0]?.id).toBe(thread.id);
	expect((await worker.reviews.resolve({ id: thread.id, resolved: true })).status).toBe("resolved");
	const missingHostToken = client(`agent:${runId}`, undefined, attempt.token);
	for (const call of [
		() => missingHostToken.brief.get({ ticket: ticket.identifier }),
		() => missingHostToken.system.health({}),
		() => missingHostToken.reviews.list({ pr: "owner/repo#17" }),
		() => missingHostToken.reviews.resolve({ id: thread.id, resolved: false }),
	])
		await expect(call()).rejects.toMatchObject({ status: 401 });
	await t.editServerTx((tx) => reserveAttempt({ now: new Date() }, tx, { runId }));
	await expect(worker.reviews.resolve({ id: thread.id, resolved: false })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		status: 400,
	});
});
