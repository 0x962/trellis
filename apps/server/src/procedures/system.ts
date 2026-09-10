import { call, os } from "./base.ts";

export const system = os.system.router({
	health: os.system.health.handler(({ context }) => call(context, "system.health", {})),
	gh: os.system.gh.handler(({ context }) => call(context, "system.gh", {})),
	backup: os.system.backup.handler(({ context }) => call(context, "system.backup", {})),
});
