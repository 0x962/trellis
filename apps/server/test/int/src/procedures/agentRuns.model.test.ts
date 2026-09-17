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
		t.client.agentRuns.setModel({
			id,
			model: "anthropic/claude-opus-5",
			expectedTerminalId: "old-attempt",
			requestId: "switch",
		}),
	).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		status: 400,
		data: { issues: [{ path: ["expectedTerminalId"], message: expect.stringContaining("another attempt") }] },
	});
});

test("the model catalog filters harness choices and rejects freeform IDs", async () => {
	t = await createTestApp();
	const all = await t.client.models.list({});
	expect(new Set(all.map((model) => model.id.split("/")[0]))).toEqual(
		new Set(["google", "anthropic", "meta", "openai"]),
	);
	const models = await t.client.models.list({ harness: "codex" });
	expect(models).toContainEqual({ id: "openai/gpt-6-astra", name: "GPT-6 Astra" });
	expect(models.every((model) => model.id.startsWith("openai/"))).toBe(true);
	await expect(
		t.client.agentRuns.setModel({ id: ulid(), model: "opus", expectedTerminalId: "attempt", requestId: "invalid" }),
	).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["model"], message: expect.stringContaining("canonical") }] },
	});
});
