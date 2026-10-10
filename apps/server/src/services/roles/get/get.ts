import { RoleIdInputSchema } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { read } from "../read";

export async function get(_ctx: ServiceCtx, tx: Tx, rawInput: unknown) {
	return read(tx, RoleIdInputSchema.parse(rawInput).id);
}
