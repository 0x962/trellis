import { afterEach, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { sql } from "drizzle-orm";
import { managerTools } from "../../../../src/agents/managerTools/managerTools.ts";
import { ensureNativeRuntime, nativeClient } from "../../../../src/agents/native/connection.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await nativeClient(t.home).shutdown();
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("agent inspection retrieves optional details through the API and runtime", async () => {
	t = await createTestApp({ home: mkdtempSync("/tmp/trl-inspect-") });
	const project = await t.seedProject("OBS");
	const id = "01M277VFQA2HAWB58T9NTW4MX5";
	await t.editServerTx((tx) =>
		tx.execute(sql`INSERT INTO agent_runs
		(id,name,persona_name,kind,instruction,project_id,project_path,terminal_id,created_at,updated_at)
		VALUES (${id},'Worker','Builder','builder','Read',${project.id},'OBS','attempt',now(),now())`),
	);
	const client = await ensureNativeRuntime(t.home);
	await client.start({
		id: "attempt",
		command: "/bin/cat",
		args: [],
		cwd: t.home,
		mode: "pty",
		env: { TRELLIS_ATTEMPT_TOKEN: "secret" },
	});
	const tool = { id: "tool", name: "Read", input: { path: "README.md" }, output: "file contents" };
	await client.observe("attempt", "secret", { kind: "tool-start", tool });
	await client.observe("attempt", "secret", { kind: "tool-end", tool });
	await client.observe("attempt", "secret", { kind: "message", message: { text: "Fixture read." } });
	const tools = managerTools(async (operation, input) => {
		expect(operation).toBe("agentRuns.session");
		return t.client.agentRuns.session(input as { id: string });
	});
	const summary = await tools.call("trellis_agentRuns_session", { id });
	expect(summary).not.toHaveProperty("lastTool");
	expect(summary).not.toHaveProperty("lastMessage");
	expect(summary).not.toHaveProperty("process");
	expect(
		await tools.call("trellis_agentRuns_session", { id, include: ["lastTool", "lastMessage", "process"] }),
	).toMatchObject({
		lastTool: { ...tool, status: "completed" },
		lastMessage: { text: "Fixture read." },
		process: { attemptId: "attempt" },
	});
});
