import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { managerProtocol } from "../../../../../src/agents/managerTools/managerProtocol.ts";
import { managerTools } from "../../../../../src/agents/managerTools/managerTools.ts";
import { createTestApp } from "../../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

test("manager tool errors retain closed assignment and stale generation reasons from the real API", async () => {
	const t = await createTestApp();
	try {
		const project = await t.client.projects.create({ key: "ERR", name: "Manager errors" });
		const managerId = ulid();
		const workerId = ulid();
		await t.editServerTx(async (tx) => {
			await tx.execute(sql`INSERT INTO agent_runs
				(id,name,runtime,persona_name,kind,instruction,project_id,project_path,closed_at,created_at,updated_at)
				VALUES (${workerId},'Worker','native','Builder','builder','Task',${project.id},'ERR',now(),now(),now()),
				(${managerId},'Manager','native','Manager','manager','Manage',${project.id},'ERR',NULL,now(),now())`);
			await tx.execute(sql`INSERT INTO manager_dispatches
				(id,project_id,generation,state,events,due_at,created_at,updated_at)
				VALUES ('dispatch',${project.id},3,'sent','[]'::jsonb,now(),now(),now())`);
		});
		const client = t.as(`agent:${managerId}`) as unknown as Record<
			string,
			Record<string, (input: unknown) => Promise<unknown>>
		>;
		const handle = managerProtocol(
			managerTools((operation, input) => {
				const [group, action] = operation.split(".") as [string, string];
				return client[group]![action]!(input);
			}),
		);
		for (const [name, input, path, message] of [
			[
				"trellis_agentRuns_send",
				{ id: workerId, text: "Continue work." },
				"id",
				"This assignment is closed. Start a new attempt before sending a message.",
			],
			[
				"trellis_controller_handle",
				{
					id: "dispatch",
					generation: 2,
					outcomes: [{ ticketId: null, status: "no_action", reason: "Every ticket has an owner." }],
				},
				"generation",
				"Read the current dispatch generation before recording its outcome.",
			],
		] as const) {
			const response = await handle(
				JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: input } }),
			);
			expect(response).toMatchObject({
				result: {
					isError: true,
					content: [
						{
							type: "text",
							text: JSON.stringify({
								code: "INPUT_VALIDATION_FAILED",
								message,
								data: { issues: [{ message, path: [path] }] },
							}),
						},
					],
				},
			});
		}
		await t.serverTx(assertStatusInvariant);
	} finally {
		await t.close();
	}
});
