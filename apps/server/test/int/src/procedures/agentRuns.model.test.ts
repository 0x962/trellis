import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("model changes reach the service and reject an outdated attempt before runtime control", async () => {
	t = await createTestApp();
	const project = await t.seedProject("MOD");
	const id = ulid();
	const personaId = ulid();
	await t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES (${personaId},'Builder','builder','Build',now(),now())`);
		await tx.execute(sql`INSERT INTO agent_runs (id,name,runtime,persona_id,persona_name,kind,instruction,project_id,project_path,terminal_id,created_at,updated_at)
		VALUES (${id},'Builder','native',${personaId},'Builder','builder','Build',${project.id},'MOD','current-attempt',now(),now())`);
	});
	await expect(
		t.client.agentRuns.setModel({ id, model: "opus", expectedTerminalId: "old-attempt", requestId: "switch" }),
	).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		status: 400,
		data: { issues: [{ path: ["expectedTerminalId"], message: expect.stringContaining("another attempt") }] },
	});
});
