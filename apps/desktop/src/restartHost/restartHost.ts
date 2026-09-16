import { activateHostRelease } from "../activateHostRelease/activateHostRelease.ts";
import { connectHost, type HostOptions, waitForHostExit } from "../host/host.ts";
import { pinResources } from "../pinnedResources/pinnedResources.ts";

type RestartOptions =
	| { mode: "development"; options: HostOptions }
	| { mode: "packaged"; home: string; helper: string; resources: string; userData: string };

// A packaged Restart runs the same save-and-restore release path as an
// update, in restart mode, so every running manager resumes before it returns.
export const restartHost = async (input: RestartOptions, report: (stage: string) => Promise<void> = async () => {}) => {
	if (input.mode === "development") {
		await report("Connect to background host");
		const host = await connectHost(input.options);
		await report("Stop background host");
		process.kill(host.pid, "SIGTERM");
		await waitForHostExit(input.options.home);
		await report("Start background host");
		return connectHost(input.options);
	}
	const { home, helper, resources, userData } = input;
	await report("Check installed app");
	const available = await pinResources(resources, userData);
	return activateHostRelease(home, helper, available, {}, report, "restart");
};
