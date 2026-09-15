import { readRestartPlan, restartPending } from "@trellis/runtime-protocol/restart-plan";
import { captureRestartPlan } from "../captureRestartPlan/captureRestartPlan.ts";
import { adoptHost, assertManagedHome, type HostConnection, waitForHostExit } from "../host/host.ts";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";
import { resumeRestartPlan } from "../resumeRestartPlan/resumeRestartPlan.ts";
import { serviceCommand } from "../service/service.ts";
import { serviceNeedsRegistration } from "../serviceRegistration/serviceRegistration.ts";
import { stopReleaseRuntime } from "../stopReleaseRuntime/stopReleaseRuntime.ts";
import { readUpdateStatus } from "../updateStatus/updateStatus.ts";

type Actions = {
	ensureService: () => Promise<void>;
	adopt: () => Promise<HostConnection>;
	unregister: () => Promise<void>;
	wait: () => Promise<void>;
	capture: (release: PinnedRelease) => Promise<void>;
	shutdown: (release: PinnedRelease) => Promise<void>;
	register: () => Promise<void>;
	resume: (host: HostConnection) => Promise<void>;
};

export const activateHostRelease = async (
	home: string,
	helper: string,
	available: PinnedRelease,
	overrides: Partial<Actions> = {},
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
		capture: (release) => captureRestartPlan(home, release, available),
		shutdown: (release) => stopReleaseRuntime(home, release),
		resume: (host) => resumeRestartPlan(home, host),
		register: async () => {
			const state = await serviceCommand(helper, "register");
			if (state.status !== "enabled") throw new Error(`Background service status: ${state.status}.`);
		},
		...overrides,
	};
	assertManagedHome(home);
	const status = await readUpdateStatus(home, available);
	if (!status.active || status.state === "current") {
		await actions.ensureService();
		const host = await actions.adopt();
		if (restartPending(home)) {
			const adopted = await readUpdateStatus(home, available);
			if (adopted.state !== "current" || adopted.active?.manifest.id !== available.manifest.id)
				throw new Error("The background service did not start the expected release. Inspect the local host log.");
		}
		await actions.resume(host);
		return host;
	}
	if (status.state === "blocked" && status.runtimeProtocol === null) throw new Error(status.detail);
	const pending = await readRestartPlan(home);
	if (
		pending &&
		(pending.sourceReleaseId !== status.active.manifest.id || pending.sessions.some((session) => session.done))
	) {
		const host = await actions.adopt();
		const previous = await readUpdateStatus(home, status.active);
		if (previous.state !== "current" || previous.active?.manifest.id !== status.active.manifest.id)
			throw new Error("Finish the pending agent restart with its active host before another package update.");
		await actions.resume(host);
		if (restartPending(home)) throw new Error("Finish the pending agent restart before another package update.");
	}
	await actions.unregister();
	await actions.wait();
	await actions.capture(status.active);
	await actions.shutdown(status.active);
	await actions.register();
	const host = await actions.adopt();
	const activated = await readUpdateStatus(home, available);
	if (activated.state !== "current" || activated.active?.manifest.id !== available.manifest.id)
		throw new Error("The background service did not start the expected release. Inspect the local host log.");
	await actions.resume(host);
	return host;
};
