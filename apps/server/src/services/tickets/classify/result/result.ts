import type { Tx } from "../../../../db/tx.ts";
import { resolveMutableProject } from "../../../refs.ts";
import type { IoCtx } from "../../../support.ts";
import { resolvePlacement } from "../../placement.ts";
import type { classify } from "../classify.ts";

export const classificationResult = async (ctx: IoCtx, tx: Tx, input: Awaited<ReturnType<typeof classify>>) => {
	const project = await resolveMutableProject(ctx.core, tx, input.project);
	const placement = await resolvePlacement(
		ctx.core,
		tx,
		project.id,
		{ epicId: null, epicRef: null, waveId: null, waveRef: null },
		input.suggestion,
	);
	return { ...input.suggestion, epic: placement.epicRef, wave: placement.waveRef };
};
