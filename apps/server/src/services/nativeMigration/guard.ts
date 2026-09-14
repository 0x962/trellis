import type { NativeMigrationInventory } from "@trellis/api";
import { requireActor, type ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { assertRuntimeReleased } from "../runtimeOwnership.ts";
export const human = (ctx: ServiceCtx) => {
	const actor = requireActor(ctx);
	if (actor.kind !== "human") throw invalidInput("actor", "A person must apply or roll back a project migration.");
	return actor;
};
export const assertMigrationReady = async (tx: Tx, snapshot: NativeMigrationInventory, expectedVersion: string) => {
	if (snapshot.version !== expectedVersion)
		throw invalidInput(
			"expectedVersion",
			`Project ${snapshot.projectId} changed. Read the migration inventory again and use its current version.`,
		);
	if (snapshot.blockers.length > 0)
		throw invalidInput("project", snapshot.blockers.map((blocker) => blocker.reason).join(" "));
	for (const project of snapshot.projects) await assertRuntimeReleased(tx, project.id);
};
