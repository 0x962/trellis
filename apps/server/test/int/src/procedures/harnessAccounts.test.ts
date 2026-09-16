import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
const savedProfile = process.env.CLAUDE_CONFIG_DIR;

beforeEach(async () => {
	delete process.env.CLAUDE_CONFIG_DIR;
	t = await createTestApp();
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
	if (savedProfile) process.env.CLAUDE_CONFIG_DIR = savedProfile;
});

test("settings retain several accounts per harness and expose no credentials", async () => {
	const first = await t.api("/api/harness-accounts", { method: "POST", body: { name: "Personal", harness: "claude" } });
	expect(first.status, JSON.stringify({ body: first.body, logs: t.records })).toBe(200);
	const second = await t.api("/api/harness-accounts", { method: "POST", body: { name: "Work", harness: "claude" } });
	expect(second.status).toBe(200);
	expect(first.body.profilePath).not.toBe(second.body.profilePath);
	const listed = await t.api("/api/harness-accounts");
	expect(listed.body.map((a: { name: string }) => a.name).sort()).toEqual(["Personal", "Work"]);
	expect(JSON.stringify(listed.body)).not.toContain("access_token");
	const selected = await t.api(`/api/harness-accounts/${second.body.id}`, {
		method: "PATCH",
		body: { isDefault: true },
	});
	expect(selected.status).toBe(200);
	expect(selected.body.isDefault).toBe(true);
	const quota = await t.api(`/api/harness-accounts/${first.body.id}/quota`);
	expect(quota.status).toBe(200);
	expect(quota.body.status).toBe("signed_out");
	expect(quota.body.windows).toEqual([]);
	const removed = await t.api(`/api/harness-accounts/${first.body.id}`, { method: "DELETE" });
	expect(removed.status).toBe(200);
	expect((await t.api("/api/harness-accounts")).body).toHaveLength(1);
});

test("only a person can add or change accounts, and AGY is excluded", async () => {
	const agy = await t.api("/api/harness-accounts", { method: "POST", body: { name: "Excluded", harness: "agy" } });
	expect(agy.status).toBe(400);
	const agent = await t.api("/api/harness-accounts", {
		method: "POST",
		actor: "agent:manager",
		body: { name: "No", harness: "claude" },
	});
	expect(agent.status).toBe(400);
	expect((await t.api("/api/harness-accounts")).body).toEqual([]);
});
test("a default replacement is unique and duplicate profiles are rejected", async () => {
	const first = await t.api("/api/harness-accounts", { method: "POST", body: { name: "One", harness: "claude" } });
	const second = await t.api("/api/harness-accounts", { method: "POST", body: { name: "Two", harness: "claude" } });
	await t.api(`/api/harness-accounts/${first.body.id}`, { method: "PATCH", body: { isDefault: true } });
	await t.api(`/api/harness-accounts/${second.body.id}`, { method: "PATCH", body: { isDefault: true } });
	const listed = (await t.api("/api/harness-accounts")).body;
	expect(
		listed.filter((account: { isDefault: boolean }) => account.isDefault).map((account: { id: string }) => account.id),
	).toEqual([second.body.id]);
	const disabled = await t.api(`/api/harness-accounts/${second.body.id}`, {
		method: "PATCH",
		body: { enabled: false },
	});
	expect(disabled.status).toBe(400);
	const duplicate = await t.api("/api/harness-accounts", {
		method: "POST",
		body: { name: "Duplicate", harness: "claude", profilePath: first.body.profilePath },
	});
	expect(duplicate.status).toBe(400);
});

test("an account stays registered while an open assignment uses it", async () => {
	const account = await t.api("/api/harness-accounts", { method: "POST", body: { name: "Active", harness: "claude" } });
	await t.serverTx((tx) =>
		tx.execute(
			sql`INSERT INTO agent_runs(id,name,runtime,persona_name,kind,instruction,project_path,account_id,created_at,updated_at) VALUES ('active','Active','native','Builder','builder','Build.','TEST',${account.body.id},now(),now())`,
		),
	);
	const removal = await t.api(`/api/harness-accounts/${account.body.id}`, { method: "DELETE" });
	expect(removal.status).toBe(400);
	expect((await t.api("/api/harness-accounts")).body).toHaveLength(1);
});
