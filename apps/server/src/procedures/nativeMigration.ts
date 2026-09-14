import { call, os } from "./base.ts";

export const nativeMigration = os.nativeMigration.router({
	inventory: os.nativeMigration.inventory.handler(({ context, input }) =>
		call(context, "nativeMigration.inventory", input),
	),
	apply: os.nativeMigration.apply.handler(({ context, input }) => call(context, "nativeMigration.apply", input)),
	rollback: os.nativeMigration.rollback.handler(({ context, input }) =>
		call(context, "nativeMigration.rollback", input),
	),
});
