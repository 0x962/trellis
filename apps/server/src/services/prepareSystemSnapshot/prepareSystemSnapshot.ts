import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { listBackupBlobs } from "../../db/queries/backupBlobs";
import type { Tx } from "../../db/tx.ts";
import { executionEnvironment } from "../../executionEnvironment";
import { backupCommand } from "../../storage/backupCommand";
import { copySnapshotObjects, SNAPSHOT_PREFIX } from "../../storage/backups.ts";
import { withObjectRetention } from "../../storage/objectRetention";
import { listHeldPageObjects } from "../pages/pages.ts";
import type { ServiceCtx } from "../support.ts";

const copyArgs = process.platform === "darwin" ? ["cp", "-cR"] : ["cp", "-R", "--reflink=auto"];

// The capture callback and object inventory share the database checkpoint and copy transaction.
// Object retention starts before that transaction and ends after every immutable file has a private copy.
export const prepareSystemSnapshot = async <T>(ctx: ServiceCtx, capture: (tx: Tx) => Promise<T>) => {
	const dir = join(ctx.home, "backups");
	const stamp = `${ctx.now().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}`;
	const staging = join(dir, `${SNAPSHOT_PREFIX}${stamp}`);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	mkdirSync(staging, { mode: 0o700 });
	try {
		const env = await executionEnvironment();
		const value = await withObjectRetention(ctx.home, async () => {
			const captured = await ctx.newTx(async (tx) => {
				const value = await capture(tx);
				const blobs = await listBackupBlobs(tx);
				const pages = await listHeldPageObjects(tx);
				await tx.execute(sql`CHECKPOINT`);
				await backupCommand([...copyArgs, join(ctx.home, "db"), staging], env);
				return { value, objects: { blobs, pages } };
			});
			await copySnapshotObjects(ctx.home, staging, captured.objects);
			return captured.value;
		});
		ctx.afterCommit(ctx.vacuum);
		return { staging, path: join(dir, `trellis-${stamp}.tar.gz`), value };
	} catch (error) {
		rmSync(staging, { recursive: true, force: true });
		throw error;
	}
};
