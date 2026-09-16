import { adoptHost, connectHost, type HostOptions, waitForHostExit } from "../host/host.ts";
import { pinResources } from "../pinnedResources/pinnedResources.ts";
import { serviceCommand } from "../service/service.ts";
import { readUpdateStatus } from "../updateStatus/updateStatus.ts";

type RestartOptions =
	| { mode: "development"; options: HostOptions }
	| { mode: "packaged"; home: string; helper: string; resources: string; userData: string };

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
	await report("Check host compatibility");
	const update = await readUpdateStatus(home, available);
	if (update.state === "blocked") throw new Error(update.detail);
	await report("Connect to background host");
	await adoptHost(home);
	await report("Stop background host");
	await serviceCommand(helper, "unregister");
	await waitForHostExit(home);
	await report("Start background host");
	const service = await serviceCommand(helper, "register");
	if (service.status !== "enabled") throw new Error(`Background service status: ${service.status}.`);
	await report("Wait for background host");
	return adoptHost(home);
};
