import type { FlowDocumentSaveV1Input } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";
import * as documents from "../../flowDocuments";
import { documentTag } from "../documentTag";

type Input = {
	document: FlowDocumentSaveV1Input;
	ifMatch: string | null;
	ifNoneMatch: string | null;
};

const matches = (header: string, tag: string, weak: boolean) =>
	header.split(",").some((value) => {
		const candidate = value.trim();
		return candidate === "*" || (weak ? candidate.replace(/^W\//, "") : candidate) === tag;
	});

export async function saveDocument(ctx: ServiceCtx, tx: Tx, input: Input) {
	const { document, ifMatch, ifNoneMatch } = input;
	if (ifMatch !== null || ifNoneMatch !== null) {
		const current = await documents.get(ctx, tx, { flow: document.flow });
		const tag = documentTag(current);
		if (
			(ifMatch !== null && !matches(ifMatch, tag, false)) ||
			(ifNoneMatch !== null && matches(ifNoneMatch, tag, true))
		) {
			throw fail("FLOW_VERSION_CONFLICT", { version: current.revision });
		}
	}
	return documents.save(ctx, tx, document);
}
