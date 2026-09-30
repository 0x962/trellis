import { sessionOperation } from "../../../agents/sessionOperation";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import type { IoCtx } from "../../support.ts";
import { resolveSession } from "../queries.ts";

export const prepareUpdate =
	<Input extends { id: string }, Result>(
		update: (ctx: ServiceCtx, tx: Tx, input: Input) => Promise<Result>,
		reference: "session" | "run",
	) =>
	async (ctx: IoCtx, input: Input): Promise<Result> => {
		const runId =
			reference === "run" ? input.id : await ctx.newTx(async (tx) => (await resolveSession(tx, input.id)).runId);
		return sessionOperation(ctx.home, runId, () => ctx.newTx((tx) => update(ctx.core, tx, input)));
	};
