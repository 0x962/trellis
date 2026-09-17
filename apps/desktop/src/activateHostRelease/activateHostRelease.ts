import { adoptHost, assertManagedHome, type HostConnection, waitForHostExit } from "../host/host.ts";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";
import { serviceCommand } from "../service/service.ts";
import { serviceNeedsRegistration } from "../serviceRegistration/serviceRegistration.ts";
import { stopReleaseRuntime } from "../stopReleaseRuntime/stopReleaseRuntime.ts";
import { readUpdateStatus } from "../updateStatus/updateStatus.ts";

type Actions = {
	ensureService: () => Promise<void>;
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
	overrides: Partial<Actions> = {},
	report: (stage: string) => Promise<void> = async () => {},
): Promise<HostConnection> => {
	const actions: Actions = {
		ensureService: async () => {
			const state = await serviceCommand(helper, "status");
			if (serviceNeedsRegistration(state.status)) await actions.register();
			else if (state.status !== "enabled") throw new Error(`Background service status: ${state.status}.`);
		},
		adopt: () => adoptHost(home),
		unregister: async () => {
			const state = await serviceCommand(helper, "status");
			if (serviceNeedsRegistration(state.status)) return;
			if (state.status !== "enabled" && state.status !== "requiresApproval")
				throw new Error(`Background service status: ${state.status}.`);
			await serviceCommand(helper, "unregister");
		},
		wait: () => waitForHostExit(home),
		shutdown: (release) => stopReleaseRuntime(home, release),
		register: async () => {
			const state = await serviceCommand(helper, "register");
			if (state.status !== "enabled") throw new Error(`Background service status: ${state.status}.`);
		},
		...overrides,
	};
	assertManagedHome(home);
	await report("Check host compatibility");
	const status = await readUpdateStatus(home, available);
	if (!status.active || status.state === "current") {
		await report("Start background host");
		await actions.ensureService();
		await report("Wait for background host");
		const host = await actions.adopt();
		return host;
	}
	if (status.state === "blocked" && status.runtimeProtocol === null) throw new Error(status.detail);
	await report("Stop background host");
	await actions.unregister();
	await actions.wait();
	await report("Restart agent runtime");
	await actions.shutdown(status.active);
	await report("Start background host");
	await actions.register();
	await report("Wait for background host");
	const host = await actions.adopt();
	const activated = await readUpdateStatus(home, available);
	if (activated.state !== "current" || activated.active?.manifest.id !== available.manifest.id)
		throw new Error("The background service did not start the expected release. Inspect the local host log.");
	return host;
};
