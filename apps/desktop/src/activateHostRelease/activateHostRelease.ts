import { adoptHost, type HostConnection, waitForHostExit } from "../host/host.ts";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";
import { serviceCommand } from "../service/service.ts";
import { stopReleaseRuntime } from "../stopReleaseRuntime/stopReleaseRuntime.ts";
import { readUpdateStatus } from "../updateStatus/updateStatus.ts";

type Actions = {
	adopt: () => Promise<HostConnection>;
	unregister: () => Promise<void>;
	wait: () => Promise<void>;
	shutdown: (release: PinnedRelease) => Promise<void>;
	register: () => Promise<void>;
};

export const activateHostRelease = async (
	home: string,
	helper: string,
	available: PinnedRelease,
	actions: Actions = {
		adopt: () => adoptHost(home),
		unregister: async () => {
			await serviceCommand(helper, "unregister");
		},
		wait: () => waitForHostExit(home),
		shutdown: (release) => stopReleaseRuntime(home, release),
		register: async () => {
			const state = await serviceCommand(helper, "register");
			if (state.status !== "enabled") throw new Error(`Background service status: ${state.status}.`);
		},
	},
): Promise<HostConnection> => {
	const status = await readUpdateStatus(home, available);
	if (!status.active || status.state === "current") return actions.adopt();
	if (status.state === "blocked" && status.runtimeProtocol === null) throw new Error(status.detail);
	await actions.unregister();
	await actions.wait();
	await actions.shutdown(status.active);
	await actions.register();
	const host = await actions.adopt();
	const activated = await readUpdateStatus(home, available);
	if (activated.state !== "current" || activated.active?.manifest.id !== available.manifest.id)
		throw new Error("The background service did not start the expected release. Inspect the local host log.");
	return host;
};
