import { afterEach, expect, test } from "bun:test";
import { readRestartPlan, writeRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let app: TestApp;
afterEach(async () => {
	if (!app) return;
	await app.serverTx(assertStatusInvariant);
	await app.close();
});

test("the desktop restart endpoint requires an actor and permits a repeated completed request", async () => {
	app = await createTestApp();
	const missingActor = await app.api("/api/native-work/restart/resume", {
		method: "POST",
		body: { restartId: "completed" },
		actor: null,
	});
	expect(missingActor.status).toBe(400);
	expect(missingActor.body.code).toBe("ACTOR_REQUIRED");
	for (let count = 0; count < 2; count++) {
		const result = await app.api("/api/native-work/restart/resume", {
			method: "POST",
			body: { restartId: "completed" },
		});
		expect(result.status).toBe(200);
		expect(result.body).toEqual({ resumed: 0, skipped: 0 });
	}
});

test("a pending restart blocks new assignments and leaves its intent intact", async () => {
	app = await createTestApp();
	await app.seedProject("RST");
	const ticket = await app.createTicket({ project: "RST", title: "Resume the existing session" });
	const persona = await app.client.personas.create({ name: "Builder", kind: "builder", instruction: "Do the work." });
	await writeRestartPlan(app.home, {
		version: 1,
		id: "pending",
		sourceReleaseId: "old",
		targetReleaseId: "new",
		createdAt: new Date().toISOString(),
		sessions: [],
	});
	await expect(app.client.agentRuns.start({ ticket: ticket.identifier, personaId: persona.id })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["restart"] }] },
	});
	expect(await app.client.agentRuns.list({ project: "RST" })).toEqual([]);
	expect((await readRestartPlan(app.home))?.id).toBe("pending");
	expect((await app.api("/api/health")).status).toBe(200);
});
