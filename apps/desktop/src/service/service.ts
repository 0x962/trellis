import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type ServiceStatus = "notRegistered" | "enabled" | "requiresApproval" | "notFound" | "unknown";
export type ServiceState = { status: ServiceStatus; bundle: string };
const execute = promisify(execFile);

export const serviceCommand = async (
	helper: string,
	command: "status" | "register" | "unregister",
): Promise<ServiceState> => {
	const { stdout } = await execute(helper, [command], { timeout: 15000 });
	return JSON.parse(stdout) as ServiceState;
};

export const openServiceSettings = async (helper: string) => {
	await execute(helper, ["settings"], { timeout: 15000 });
};
