import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeClient } from "../../agents/native/connection.ts";
import { rows } from "../../db/queries/support.ts";
import { dispatchMessageId } from "../controller/messageId.ts";
import { deliveryMessageId } from "../reviews/deliveryMessageId.ts";
import type { ServiceCtx } from "../support.ts";
import { lostDelivery } from "./sentences.ts";

type Kind = "comment" | "dispatch" | "review";

// One send that Trellis recorded with no result. `ids` names every delivery
// row that the send covered, and `messageId` is what the input ledger of the
// agent session holds for that send. `generation` belongs to a manager
// dispatch, whose row counts only while the controller still runs that
// generation.
type Group = { kind: Kind; ids: string[]; terminalId: string; messageId: string; generation: number | null };

// The outcome of one uncertain send, or null while nobody can settle it.
type Outcome = { state: "sent" | "failed"; error: string | null } | null;

// Answers whether the execution service wrote this message into that agent
// session. The answer rejects when the service cannot say, for example when
// it is down or when it no longer holds a record of the session.
export type AskLedger = (terminalId: string, messageId: string) => Promise<boolean>;

const askRuntime =
	(home: string): AskLedger =>
	async (terminalId, messageId) =>
		(await nativeClient(home).hasMessage(terminalId, messageId)).delivered;

const uncertainGroups = (ctx: ServiceCtx): Promise<Group[]> =>
	ctx.newTx(async (tx) => {
		const comments = await rows<{ id: string; terminalId: string }>(
			tx,
			sql`SELECT id, terminal_id AS "terminalId" FROM comment_deliveries WHERE state='unknown' AND terminal_id IS NOT NULL`,
		);
		const dispatches = await rows<{ id: string; generation: number; terminalId: string }>(
			tx,
			sql`SELECT id, generation, terminal_id AS "terminalId" FROM manager_dispatches WHERE state='unknown' AND terminal_id IS NOT NULL`,
		);
		const reviews = await rows<{ id: string; attempt: number; terminalId: string }>(
			tx,
			sql`SELECT d.id, d.attempt, r.terminal_id AS "terminalId" FROM review_deliveries d JOIN agent_runs r ON r.id=d.run_id
			WHERE d.state='unknown' AND r.terminal_id IS NOT NULL`,
		);
		return [
			...comments.map((row) => ({
				kind: "comment" as const,
				ids: [row.id],
				terminalId: row.terminalId,
				messageId: row.id,
				generation: null,
			})),
			...dispatches.map((row) => ({
				kind: "dispatch" as const,
				ids: [row.id],
				terminalId: row.terminalId,
				messageId: dispatchMessageId(row),
				generation: row.generation,
			})),
			...reviews.map((row) => ({
				kind: "review" as const,
				ids: [row.id],
				terminalId: row.terminalId,
				messageId: deliveryMessageId(row),
				generation: null,
			})),
		];
	});

const settle = async (session: RuntimeProcessStatus, group: Group, ask: AskLedger): Promise<Outcome> => {
	if (session.acknowledgedMessageIds.includes(group.messageId)) return { state: "sent", error: null };
	const delivered = await ask(group.terminalId, group.messageId).then(
		(answer) => answer,
		() => null,
	);
	if (delivered === true) return { state: "sent", error: null };
	if (delivered === null || session.status !== "exited") return null;
	return { state: "failed", error: lostDelivery };
};

const statement = (ctx: ServiceCtx, group: Group, outcome: NonNullable<Outcome>) => {
	const ids = sql.join(
		group.ids.map((id) => sql`${id}`),
		sql`,`,
	);
	switch (group.kind) {
		case "comment":
			return sql`UPDATE comment_deliveries SET state=${outcome.state},error=${outcome.error} WHERE state='unknown' AND id IN (${ids})`;
		case "review":
			return sql`UPDATE review_deliveries SET state=${outcome.state},error=${outcome.error} WHERE state='unknown' AND id IN (${ids})`;
		case "dispatch":
			return sql`UPDATE manager_dispatches SET state=${outcome.state},error=${outcome.error},updated_at=${ctx.now()}
				WHERE state='unknown' AND generation=${group.generation} AND id IN (${ids})`;
	}
};

// Settles every delivery row that a send left uncertain, so that a person
// reads an uncertain row only where no machine can answer. For each send the
// controller asks the agent session two questions: did the agent confirm the
// message, and does the input ledger of the session hold it. A yes to either
// makes the row sent. A no from a session that has ended makes the row
// failed, because a message that is not in the ledger of an ended session can
// never arrive. Every other case leaves the row as it is, and the next
// controller tick asks again.
export const reconcileUnknownDeliveries = async (
	ctx: ServiceCtx,
	input: { sessions: RuntimeProcessStatus[] },
	ask: AskLedger = askRuntime(ctx.home),
) => {
	for (const group of await uncertainGroups(ctx)) {
		const session = input.sessions.find((item) => item.id === group.terminalId);
		if (!session) continue;
		const outcome = await settle(session, group, ask);
		if (outcome === null) continue;
		await ctx.newTx((tx) => tx.execute(statement(ctx, group, outcome)));
	}
	return {};
};
