import { archive, type Snapshot } from "../services/system.ts";
import { call, os } from "./base.ts";

export const system = os.system.router({
	health: os.system.health.handler(({ context }) => call(context, "system.health", {})),
	gh: os.system.gh.handler(({ context }) => call(context, "system.gh", {})),
	// The snapshot holds the database worker for a CHECKPOINT and a copy. The
	// compression runs here, so the worker serves every other request while
	// the archive is written.
	backup: os.system.backup.handler(async ({ context }) =>
		archive(await call<Snapshot>(context, "system.snapshot", {})),
	),
});
