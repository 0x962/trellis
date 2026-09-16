import { dialog } from "electron";
import { assertManagedHome, ensureHostToken, type HostConnection, waitForHostExit } from "../host/host.ts";
import { openServiceSettings, serviceCommand } from "../service/service.ts";
import { serviceNeedsRegistration } from "../serviceRegistration/serviceRegistration.ts";
import { stopHostWork } from "../stopHostWork/stopHostWork.ts";

export const requireService = async (helper: string, home: string) => {
	ensureHostToken(home);
	assertManagedHome(home);
	let state = await serviceCommand(helper, "status");
	if (serviceNeedsRegistration(state.status)) state = await serviceCommand(helper, "register");
	if (state.status === "requiresApproval") {
		await dialog.showMessageBox({
			type: "info",
			message: "Allow Trellis in Login Items",
			detail: "macOS has disabled the background service. Allow Trellis in System Settings, then reopen the app.",
			buttons: ["Open System Settings"],
		});
		await openServiceSettings(helper);
	}
	if (state.status !== "enabled") throw new Error(`Background service status: ${state.status}.`);
};

export const showServiceStatus = async (helper: string) => {
	try {
		const state = await serviceCommand(helper, "status");
		const { response } = await dialog.showMessageBox({
			message: `Background service: ${state.status}`,
			detail:
				"The service keeps local agents active when Trellis closes. System Settings controls its permission to run at login.",
			buttons: ["Done", "Open System Settings"],
		});
		if (response === 1) await openServiceSettings(helper);
	} catch (error) {
		dialog.showErrorBox("Background service status", (error as Error).message);
	}
};

export const stopLocalWork = async (host: HostConnection, home: string, helper?: string): Promise<boolean> => {
	const { response } = await dialog.showMessageBox({
		type: "warning",
		message: "Stop local work and the background service?",
		detail:
			"Trellis pauses automatic dispatch for local projects, stops their known processes, and disables its background service. Superset and other external sessions remain active.",
		buttons: ["Cancel", "Stop local work"],
		defaultId: 0,
		cancelId: 0,
	});
	if (response !== 1) return false;
	await stopHostWork(host, async () => {
		if (helper) await serviceCommand(helper, "unregister");
		else process.kill(host.pid, "SIGTERM");
		await waitForHostExit(home);
	});
	return true;
};

export const resumeLocalWork = async (host: HostConnection) => {
	const result = await fetch(`${host.origin}/api/native-work/resume`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${host.token}`,
			"content-type": "application/json",
			"x-trellis-actor": "human:desktop",
		},
		body: "{}",
	});
	if (!result.ok) throw new Error(await result.text());
	await dialog.showMessageBox({
		message: "Local work is enabled",
		detail: "You can start local agents. Each project's Automatic dispatch switch keeps its saved setting.",
		buttons: ["Done"],
	});
};
