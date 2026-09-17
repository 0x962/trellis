import { archive, type Snapshot } from "../services/system.ts";
import { call, os } from "./base.ts";

export const system = os.system.router({
	doctor: os.system.doctor.handler(({ context }) => call(context, "system.doctor", {})),
	resumeRestart: os.system.resumeRestart.handler(({ context, input }) => call(context, "system.resumeRestart", input)),
	restartStatus: os.system.restartStatus.handler(({ context }) => call(context, "system.restartStatus", {})),
	stopNativeWork: os.system.stopNativeWork.handler(({ context }) => call(context, "system.stopNativeWork", {})),

	chooseDirectory: os.system.chooseDirectory.handler(({ context }) => context.chooseDirectory()),
	health: os.system.health.handler(({ context }) => call(context, "system.health", {})),
	gh: os.system.gh.handler(({ context }) => context.gh.read()),
	checkGh: os.system.checkGh.handler(({ context }) => context.gh.check()),
	// The snapshot holds the database worker for a CHECKPOINT and a copy. The
	// compression runs here, so the worker serves every other request while
	// the archive is written.
	backup: os.system.backup.handler(async ({ context }) =>
		archive(await call<Snapshot>(context, "system.snapshot", {})),
	),
});
