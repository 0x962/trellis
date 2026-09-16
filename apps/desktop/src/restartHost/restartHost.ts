import { activateHostRelease } from "../activateHostRelease/activateHostRelease.ts";
import { connectHost, type HostOptions, waitForHostExit } from "../host/host.ts";
import { pinResources } from "../pinnedResources/pinnedResources.ts";

type RestartOptions =
	| { mode: "development"; options: HostOptions }
	| { mode: "packaged"; home: string; helper: string; resources: string; userData: string };
type Dependencies = {
	pinResources: typeof pinResources;
	activateHostRelease: typeof activateHostRelease;
};
const defaults: Dependencies = { pinResources, activateHostRelease };

export const restartHost = async (
	input: RestartOptions,
	report: (stage: string) => Promise<void> = async () => {},
	deps: Dependencies = defaults,
) => {
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
	const available = await deps.pinResources(resources, userData);
	return deps.activateHostRelease(home, helper, available, {}, report, "restart");
};
