import { sql } from "drizzle-orm";
import { evidenceHoldsBlob } from "../db/queries/prEvidence.ts";
import { rows } from "../db/queries/support.ts";
import { gcBlobs as gcStoredBlobs } from "../storage/blobs.ts";
import type { ServiceCtx } from "./support.ts";

type BlobCtx = Pick<ServiceCtx, "home" | "newTx">;

const holdsSha = (ctx: BlobCtx, sha256: string) =>
	ctx.newTx(async (tx) => {
		const [row] = await rows<{ held: boolean }>(
			tx,
			sql`SELECT EXISTS (SELECT 1 FROM attachments WHERE sha256 = ${sha256}) AS held`,
		);
		return row!.held || (await evidenceHoldsBlob(tx, sha256));
	});

// Removes each file that no attachment or evidence row owns. The caller runs
// this after its transaction commits, so a rollback keeps every file.
export const gcBlobs = (ctx: BlobCtx, shas: string[]) =>
	gcStoredBlobs(ctx.home, shas, (sha256) => holdsSha(ctx, sha256));
