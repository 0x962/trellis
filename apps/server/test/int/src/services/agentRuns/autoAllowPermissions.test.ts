import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { DEFAULT_PROJECT_MANAGER_CONFIG } from "@trellis/api";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import type { HarnessSnapshot } from "../../../../../src/agents/nativeHarness/types.ts";
import { autoAllowPermissions } from "../../../../../src/services/agentRuns/autoAllowPermissions.ts";
import { getRun } from "../../../../../src/services/agentRuns/queries.ts";
import { seedActors, seedRoot } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let runId: string;
let project: string;
const calls: { id: string; key: string; response: unknown }[] = [];
let outcome: "written" | "unknown";
const client: Pick<RuntimeClient, "deliver"> = {
	deliver: async (id, key, bytes) => {
		calls.push({ id, key, response: JSON.parse(Buffer.from(bytes, "base64").toString()) });
		return { messageId: key, status: outcome };
	},
};
const snapshot = (): HarnessSnapshot => ({
	state: "needs_input",
	sessionId: "session",
	pendingPermissions: [
		{ requestId: "request", toolName: "Write", toolUseId: "tool", input: { file_path: "/tmp/result", content: "ok" } },
	],
	transcript: [],
	acknowledgedMessageIds: [],
	result: null,
	error: null,
});
const config = async (patch: Record<string, unknown>) => {
	await h.rows(
		sql`UPDATE projects SET manager_config=${{ ...DEFAULT_PROJECT_MANAGER_CONFIG, trustedDirectory: true, ...patch }} WHERE id=${project}`,
	);
};
const invoke = async (value = snapshot(), target = client) =>
	autoAllowPermissions({ newTx: h.read }, await h.read((tx) => getRun(tx, runId)), value, target);
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	calls.length = 0;
	outcome = "written";
	runId = randomUUID();
	await h.read(async (tx) => {
		await seedActors(tx);
		project = await seedRoot(tx, "AUTO");
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,state,terminal_id,session_id,created_at,updated_at) VALUES (${runId},'Manager','native','Manager','manager','Manage',${project},'AUTO','running','attempt','session',now(),now())`,
		);
	});
	await config({});
});
test("the default allows the original tool input through a stable permission key", async () => {
	const pending = snapshot();
	expect(await invoke(pending)).toEqual({ snapshot: pending, suppressPermissionAttention: true });
	expect(calls).toEqual([
		{
			id: "attempt",
			key: "permission-request",
			response: {
				type: "control_response",
				response: {
					subtype: "success",
					request_id: "request",
					response: { behavior: "allow", updatedInput: pending.pendingPermissions[0]!.input },
				},
			},
		},
	]);
});
test("an unchecked setting leaves pending tools for a person", async () => {
	await config({ allowAllPermissions: false });
	await invoke();
	expect(calls).toHaveLength(0);
	await config({ allowAllPermissions: true });
	await invoke();
	expect(calls).toHaveLength(1);
});
test("an untrusted directory cannot auto-approve tools", async () => {
	await config({ trustedDirectory: false });
	await invoke();
	expect(calls).toHaveLength(0);
});
for (const state of ["stopped", "interrupted", "starting"]) {
	test(`a ${state} assignment cannot auto-approve tools`, async () => {
		await h.rows(sql`UPDATE agent_runs SET state=${state} WHERE id=${runId}`);
		await invoke();
		expect(calls).toHaveLength(0);
	});
}
test("a replaced attempt cannot approve the old pending tool", async () => {
	const run = await h.read((tx) => getRun(tx, runId));
	await h.rows(sql`UPDATE agent_runs SET terminal_id='replacement' WHERE id=${runId}`);
	await autoAllowPermissions({ newTx: h.read }, run, snapshot(), client);
	expect(calls).toHaveLength(0);
});
test("another conversation cannot approve the current attempt", async () => {
	await invoke({ ...snapshot(), sessionId: "other" });
	expect(calls).toHaveLength(0);
});
test("the setting is read again between tool requests", async () => {
	const pending = snapshot();
	pending.pendingPermissions.push({ ...pending.pendingPermissions[0]!, requestId: "second" });
	await invoke(pending, {
		deliver: async (...args) => {
			const result = await client.deliver(...args);
			await config({ allowAllPermissions: false });
			return result;
		},
	});
	expect(calls).toHaveLength(1);
});
test("an unknown delivery retains the pending tool and prevents another automatic response", async () => {
	outcome = "unknown";
	const { snapshot: observed, suppressPermissionAttention } = await invoke();
	expect(suppressPermissionAttention).toBe(false);
	expect(observed.state).toBe("unknown");
	expect(observed.error).toContain("permission response");
	expect(observed.pendingPermissions).toEqual(snapshot().pendingPermissions);
	await invoke(observed);
	expect(calls).toHaveLength(1);
});

test("a saved config without the checkbox uses its enabled default", async () => {
	await h.rows(sql`UPDATE projects SET manager_config=manager_config-'allowAllPermissions' WHERE id=${project}`);
	await invoke();
	expect(calls).toHaveLength(1);
});
test("a failed runtime write retains the pending tool as unknown", async () => {
	const { snapshot: observed, suppressPermissionAttention } = await invoke(snapshot(), {
		deliver: async () => {
			throw new Error("Runtime unavailable");
		},
	});
	expect(observed.state).toBe("unknown");
	expect(suppressPermissionAttention).toBe(false);
	expect(observed.error).toContain("Runtime unavailable");
	expect(observed.pendingPermissions).toEqual(snapshot().pendingPermissions);
});

test("a pending tool does not suppress a retained permission error", async () => {
	const pending = { ...snapshot(), error: "An earlier permission was denied" };
	expect(await invoke(pending)).toEqual({ snapshot: pending, suppressPermissionAttention: false });
	expect(calls).toHaveLength(1);
});
