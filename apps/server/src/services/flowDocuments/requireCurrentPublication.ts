import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { get } from "./get.ts";

export const requireCurrentPublication = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { flow: string; expectedVersion: number },
) => {
	const document = await get(ctx, tx, input);
	if (document.revision !== input.expectedVersion) throw fail("FLOW_VERSION_CONFLICT", { version: document.revision });
	if (document.engine !== "langflow" || document.publication.state !== "published") {
		throw invalidInput("flow", "Publish the current saved document before a new run.");
	}
	return { snapshot: document, publication: document.publication.publication };
};
