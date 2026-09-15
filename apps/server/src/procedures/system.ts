import { archive, type Snapshot } from "../services/system.ts";
import { call, os } from "./base.ts";

export const system = os.system.router({
	doctor: os.system.doctor.handler(({ context }) => call(context, "system.doctor", {})),
	nativeWork: os.system.nativeWork.handler(({ context }) => call(context, "system.nativeWork", {})),
	resumeNativeWork: os.system.resumeNativeWork.handler(({ context }) => call(context, "system.resumeNativeWork", {})),
	resumeRestart: os.system.resumeRestart.handler(({ context, input }) => call(context, "system.resumeRestart", input)),
	stopNativeWork: os.system.stopNativeWork.handler(({ context }) => call(context, "system.stopNativeWork", {})),

	chooseDirectory: os.system.chooseDirectory.handler(({ context }) => context.chooseDirectory()),
	health: os.system.health.handler(({ context }) => call(context, "system.health", {})),
	gh: os.system.gh.handler(({ context }) => call(context, "system.gh", {})),
	// The snapshot holds the database worker for a CHECKPOINT and a copy. The
	// compression runs here, so the worker serves every other request while
	// the archive is written.
	backup: os.system.backup.handler(async ({ context }) =>
		archive(await call<Snapshot>(context, "system.snapshot", {})),
	),
});
