import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../support.ts";
import { beginMessage, type ChatterReceipt } from "../beginMessage";

type ChatterContext = Pick<ServiceCtx, "actor" | "now" | "newTx" | "emit">;
const announce = (ctx: ChatterContext, record: ChatterReceipt) => {
	for (const scope of new Map(record.scopes.map((scope) => [scope.id, scope])).values())
		ctx.emit({ type: "epic-chatter.changed", ...scope });
};

export const withChatter = async <T extends object>(
	ctx: ChatterContext,
	input: { id: string; text: string; messageId?: string; atTurnBoundary?: boolean },
	send: (messageId: string) => Promise<T>,
): Promise<T> => {
	const messageId = input.messageId ?? randomUUID();
	if (ctx.actor.kind !== "agent") return send(messageId);
	const record = await ctx.newTx((tx) => beginMessage(ctx, tx, { ...input, messageId }));
	if (!record) return send(messageId);
	announce(ctx, record);
	const finish = async (state: string) => {
		await ctx.newTx((tx) =>
			tx.execute(sql`UPDATE chatter_messages SET state=${state}
			WHERE id=${record.id} AND state IN ('pending', 'unconfirmed', 'skipped')`),
		);
		announce(ctx, record);
	};
	let result: T;
	try {
		result = await send(messageId);
	} catch (error) {
		await finish("unconfirmed");
		throw error;
	}
	await finish("skipped" in result && result.skipped ? "skipped" : input.atTurnBoundary ? "queued" : "sent");
	return result;
};
