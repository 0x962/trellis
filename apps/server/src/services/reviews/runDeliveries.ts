import type { RuntimeListInput } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx } from "../support.ts";
import { dispatchDeliveries } from "./dispatchDeliveries.ts";
import { openAssignment } from "./ticketRun.ts";

const readSessions = async (home: string, input: RuntimeListInput) =>
	nativeHost(home, undefined, await ensureNativeRuntime(home)).list(input);

export async function prepare(
	ctx: IoCtx,
	_input: Record<string, never> = {},
	read = readSessions,
	dispatch = dispatchDeliveries,
) {
	const assignments = await ctx.newTx((tx) =>
		rows<{ terminalId: string }>(
			tx,
			sql`SELECT DISTINCT run.terminal_id AS "terminalId" FROM agent_runs run
			JOIN review_deliveries delivery ON ${openAssignment(sql`run`, sql`delivery.ticket_id`)}
			WHERE delivery.state IN ('pending', 'held') AND run.runtime = 'native' AND run.terminal_id IS NOT NULL`,
		),
	);
	// Idle expiry retains an exited attempt, so its ID must reach the dispatcher with its stop reason.
	const sessions = assignments.length
		? (await read(ctx.home, { ids: assignments.map((assignment) => assignment.terminalId) })).sessions
		: [];
	await dispatch(ctx, sessions);
	return {};
}

export const finish = (_ctx: IoCtx, _tx: Tx, input: Record<string, never>) => Promise.resolve(input);
