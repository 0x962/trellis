import { isDeepStrictEqual } from "node:util";
import { type NativeMigration, type NativeMigrationApplyInput, ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { update } from "../projects.ts";
import { assertMigrationReady, human } from "./guard.ts";
import { inventory } from "./inventory.ts";

export const apply = async (ctx: ServiceCtx, tx: Tx, input: NativeMigrationApplyInput): Promise<NativeMigration> => {
	const actor = human(ctx);
	const [replay] = await rows<{ request: NativeMigrationApplyInput; document: NativeMigration }>(
		tx,
		sql`SELECT request,document FROM native_migrations WHERE actor_name=${actor.name} AND request_id=${input.requestId}`,
	);
	if (replay) {
		if (!isDeepStrictEqual(replay.request, input))
			throw invalidInput(
				"requestId",
				`Request ${input.requestId} belongs to migration ${replay.document.id} with different inputs. Use a new request ID.`,
			);
		return replay.document;
	}
	const before = await inventory(ctx, tx, input);
	await assertMigrationReady(tx, before, input.expectedVersion);
	const active = before.migrations.find(
		(migration) => migration.projectId === before.projectId && migration.rolledBackAt === null,
	);
	if (active)
		throw invalidInput(
			"project",
			`Project ${before.projectId} already has active migration ${active.id}. Roll it back before another migration.`,
		);
	if (before.managerConfig.ade === "native")
		throw invalidInput("project", `Project ${before.projectId} already uses native execution.`);
	const appliedConfig = ProjectManagerConfigSchema.parse({
		...before.managerConfig,
		ade: "native",
		directory: input.directory,
		trustedDirectory: false,
		dispatchPaused: true,
		supersetHostId: null,
		adeCommand: "",
		adeResumeCommand: "",
		adeCommands: null,
		harness: { preset: "claude" },
	});
	const document: NativeMigration = {
		id: ulid(),
		projectId: before.projectId,
		actorName: actor.name,
		requestId: input.requestId,
		expectedVersion: input.expectedVersion,
		beforeConfig: before.originalConfig,
		appliedConfig,
		createdAt: ctx.now.toISOString(),
		rolledBackAt: null,
		rollbackVersion: null,
	};
	await tx.execute(
		sql`INSERT INTO native_migrations (id,project_id,actor_name,request_id,request,before_inventory,document,created_at) VALUES (${document.id},${document.projectId},${actor.name},${input.requestId},${JSON.stringify(input)}::jsonb,${JSON.stringify(before)}::jsonb,${JSON.stringify(document)}::jsonb,${ctx.now})`,
	);
	await update(ctx, tx, { project: before.projectId, managerConfig: appliedConfig });
	return document;
};
