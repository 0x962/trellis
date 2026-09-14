import {
	NativeMigrationApplyInputSchema,
	NativeMigrationInventoryInputSchema,
	NativeMigrationInventorySchema,
	NativeMigrationRollbackInputSchema,
	NativeMigrationSchema,
} from "../schemas/nativeMigration.ts";
import { base } from "./base.ts";
export const nativeMigration = {
	inventory: base
		.route({
			method: "GET",
			path: "/native-migrations/inventory",
			summary: "Preview a project migration to local execution",
		})
		.input(NativeMigrationInventoryInputSchema)
		.output(NativeMigrationInventorySchema),
	apply: base
		.route({
			method: "POST",
			path: "/native-migrations",
			summary: "Migrate one inactive project to paused local execution",
		})
		.input(NativeMigrationApplyInputSchema)
		.output(NativeMigrationSchema),
	rollback: base
		.route({
			method: "POST",
			path: "/native-migrations/{migrationId}/rollback",
			summary: "Restore the prior project configuration and preserve work",
		})
		.input(NativeMigrationRollbackInputSchema)
		.output(NativeMigrationSchema),
};
