import {
	type NativeMigration,
	type NativeMigrationRollbackInput,
	ProjectManagerConfigSchema,
	type ProjectUpdateInput,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { update } from "../projects.ts";
import { assertMigrationReady, human } from "./guard.ts";
import { inventory } from "./inventory.ts";

export const rollback = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: NativeMigrationRollbackInput,
): Promise<NativeMigration> => {
	human(ctx);
	const [stored] = await rows<{ document: NativeMigration }>(
		tx,
		sql`SELECT document FROM native_migrations WHERE id=${input.migrationId}`,
	);
	if (!stored) throw invalidInput("migrationId", `Migration ${input.migrationId} does not exist.`);
	const migration = stored.document;
	if (migration.rolledBackAt !== null) {
		if (migration.rollbackVersion !== input.expectedVersion)
			throw invalidInput(
				"expectedVersion",
				`Migration ${migration.id} already rolled back. Reuse its original rollback version to retrieve the result.`,
			);
		return migration;
	}
	const before = await inventory(ctx, tx, { project: migration.projectId });
	await assertMigrationReady(tx, before, input.expectedVersion);
	ProjectManagerConfigSchema.parse(migration.beforeConfig);
	await update(ctx, tx, {
		project: migration.projectId,
		managerConfig: migration.beforeConfig as ProjectUpdateInput["managerConfig"],
	});
	const document = { ...migration, rolledBackAt: ctx.now.toISOString(), rollbackVersion: input.expectedVersion };
	await tx.execute(
		sql`UPDATE native_migrations SET document=${JSON.stringify(document)}::jsonb,rolled_back_at=${ctx.now} WHERE id=${migration.id}`,
	);
	return document;
};
