import { EpicRefInputSchema, type EpicWhiteboard } from "@trellis/api";
import type { ServiceCtx } from "../../../../context.ts";
import type { Tx } from "../../../../db/tx.ts";
import { resolveEpic } from "../../resolve.ts";
import { readWhiteboard } from "../readWhiteboard";

export async function get(ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<EpicWhiteboard> {
	const input = EpicRefInputSchema.parse(rawInput);
	const epic = await resolveEpic(ctx, tx, input.epic);
	return readWhiteboard(tx, { epicId: epic.id });
}
