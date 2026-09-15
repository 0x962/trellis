import type { ServiceStatus } from "../service/service.ts";
import type { UpdateStatus } from "../updateStatus/updateStatus.ts";

// The actions that the Desktop section of the Settings page can ask the main
// process to run. The web app keeps its own copy of these names and of
// DesktopStatus in apps/web/src/lib/desktopBridge, because the web app cannot
// import the desktop package.
export const desktopActions = [
	"chooseDataDirectory",
	"showDataDirectory",
	"openServiceSettings",
	"stopLocalWork",
	"resumeLocalWork",
	"reconnectHost",
	"quit",
] as const;
export type DesktopAction = (typeof desktopActions)[number];

export type DesktopStatus = {
	packaged: boolean;
	dataDirectory: string;
	openAtLogin: boolean;
	// The development app has no background service and no package, so both are null.
	service: ServiceStatus | null;
	update: UpdateSummary | null;
};

export type UpdateSummary = {
	state: UpdateStatus["state"];
	detail: string;
	version: string;
	release: string;
	protocol: number;
};

// The renderer shows web content from the host, so each value it sends over
// IPC is untrusted input.
export const parseDesktopAction = (value: unknown): DesktopAction => {
	if (!desktopActions.includes(value as DesktopAction)) throw new Error(`Unknown desktop action: ${String(value)}.`);
	return value as DesktopAction;
};

export const parseOpenAtLogin = (value: unknown): boolean => {
	if (typeof value !== "boolean") throw new Error("Open at login takes true or false.");
	return value;
};

export const updateSummary = (status: UpdateStatus): UpdateSummary => ({
	state: status.state,
	detail: status.detail,
	version: status.available.manifest.version,
	release: status.available.manifest.id.slice(0, 12),
	protocol: status.available.manifest.protocol,
});
