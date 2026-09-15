import type { AgentRun } from "@trellis/api";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import { claudePermissionResponse } from "../../agents/nativeHarness/claudePermissionResponse.ts";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import { rows } from "../../db/queries/support.ts";
import type { ServiceCtx } from "../support.ts";

export async function autoAllowPermissions(
	ctx: Pick<ServiceCtx, "newTx">,
	run: AgentRun,
	snapshot: HarnessSnapshot,
	client: Pick<RuntimeClient, "deliver">,
): Promise<HarnessSnapshot> {
	if (
		run.runtime !== "native" ||
		run.terminalId === null ||
		snapshot.sessionId !== run.sessionId ||
		snapshot.state !== "needs_input"
	)
		return snapshot;
	for (const permission of snapshot.pendingPermissions) {
		const [current] = await ctx.newTx((tx) =>
			rows(
				tx,
				sql`
			SELECT r.id FROM agent_runs r JOIN projects p ON p.id=r.project_id
			WHERE r.id=${run.id} AND r.runtime='native' AND r.state='running'
			AND r.terminal_id=${run.terminalId} AND r.session_id=${run.sessionId}
			AND p.manager_config->>'trustedDirectory'='true'
			AND COALESCE(p.manager_config->>'allowAllPermissions','true')='true'
		`,
			),
		);
		if (!current) return snapshot;
		try {
			const result = await client.deliver(
				run.terminalId,
				`permission-${permission.requestId}`,
				claudePermissionResponse(permission.requestId, { behavior: "allow", updatedInput: permission.input }),
			);
			if (result.status === "unknown")
				return {
					...snapshot,
					state: "unknown",
					error: "The permission response is uncertain. Inspect the agent before another response.",
				};
		} catch (error) {
			return {
				...snapshot,
				state: "unknown",
				error: `The permission response failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
	return snapshot;
}
