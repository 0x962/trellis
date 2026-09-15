import { adoptHost, connectHost, type HostOptions, waitForHostExit } from "../host/host.ts";
import { pinResources } from "../pinnedResources/pinnedResources.ts";
import { serviceCommand } from "../service/service.ts";
import { readUpdateStatus } from "../updateStatus/updateStatus.ts";

type RestartOptions =
	| { mode: "development"; options: HostOptions }
	| { mode: "packaged"; home: string; helper: string; resources: string; userData: string };

export const restartHost = async (input: RestartOptions) => {
	if (input.mode === "development") {
		const host = await connectHost(input.options);
		process.kill(host.pid, "SIGTERM");
		await waitForHostExit(input.options.home);
		return connectHost(input.options);
	}
	const { home, helper, resources, userData } = input;
	const available = await pinResources(resources, userData);
	const update = await readUpdateStatus(home, available);
	if (update.state === "blocked") throw new Error(update.detail);
	await adoptHost(home);
	await serviceCommand(helper, "unregister");
	await waitForHostExit(home);
	const service = await serviceCommand(helper, "register");
	if (service.status !== "enabled") throw new Error(`Background service status: ${service.status}.`);
	return adoptHost(home);
};
