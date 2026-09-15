import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import type { HostConnection } from "../host/host.ts";
import { waitForHostExit } from "../host/host.ts";
import { defaultDesktopUserData, readConfiguredHome } from "../selectedHome/selectedHome.ts";
import { type ServiceStatus, serviceCommand } from "../service/service.ts";
import { stopHostWork } from "../stopHostWork/stopHostWork.ts";
import { type CurrentService, inspectCurrentService } from "./inspectCurrentService.ts";

type Options = { home: string; host?: HostConnection; helper: string; userData?: string };
export type StopCurrentServiceActions = {
	status: () => Promise<ServiceStatus>;
	configuredHome: () => Promise<string>;
	inspect: () => Promise<CurrentService>;
	stopWork: (host: HostConnection, stop: () => Promise<void>) => Promise<void>;
	unregister: () => Promise<void>;
	wait: () => Promise<void>;
};

const defaults = (options: Options): StopCurrentServiceActions => ({
	status: async () => (await serviceCommand(options.helper, "status")).status,
	configuredHome: async () => readConfiguredHome(options.userData ?? defaultDesktopUserData()),
	inspect: () => inspectCurrentService(options.home),
	stopWork: stopHostWork,
	unregister: async () => {
		const state = await serviceCommand(options.helper, "unregister");
		if (state.status !== "notRegistered") throw new Error(`The background service remains ${state.status}.`);
	},
	wait: () => waitForHostExit(options.home),
});

export const stopCurrentService = async (options: Options, actions = defaults(options)): Promise<void> => {
	if (!options.host) {
		const status = await actions.status();
		if (status === "notRegistered" || status === "notFound") return;
		if (status !== "enabled" && status !== "requiresApproval")
			throw new Error(`The background service status is ${status}. Inspect it before changing data directories.`);
	}
	const home = existsSync(options.home) ? await realpath(options.home) : options.home;
	if ((await actions.configuredHome()) !== home)
		throw new Error(
			"The configured data directory does not match the current directory. Reopen Trellis before changing it.",
		);
	const unregister = async () => {
		await actions.unregister();
		await actions.wait();
	};
	if (options.host) {
		await actions.stopWork(options.host, unregister);
		return;
	}
	const current = await actions.inspect();
	if (current.host) {
		await actions.stopWork(current.host, unregister);
		return;
	}
	const assertStopped = (state: CurrentService) => {
		if (state.host || state.runtimeActive)
			throw new Error(
				"The execution service or host still owns local work. Reconnect to the current data directory before changing it.",
			);
	};
	assertStopped(current);
	await unregister();
	assertStopped(await actions.inspect());
};
