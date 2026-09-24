import type { ServiceStatus } from "../service/service.ts";
import type { UpdateStatus } from "../updateStatus/updateStatus.ts";

// The web app copies these IPC names and types because it cannot import the
// desktop package.
export const desktopActions = [
	"chooseDataDirectory",
	"showDataDirectory",
	"openServiceSettings",
	"stopLocalWork",
	"reconnectHost",
	"quit",
] as const;
export type DesktopAction = (typeof desktopActions)[number];

// NSProcessInfo publishes four thermal states, and Electron adds `unknown`.
// A nominal state can also mean that the operating system cannot read the
// state, so this value is not a temperature measurement.
export type ThermalState = "unknown" | "nominal" | "fair" | "serious" | "critical";

export type DesktopThermalSample = {
	state: ThermalState;
	sampledAt: string;
	hostOrigin: string;
};

export type DesktopStatus = {
	packaged: boolean;
	dataDirectory: string;
	openAtLogin: boolean;
};

export type DesktopServiceStatus = ServiceStatus | null;
export type DesktopUpdateStatus = UpdateSummary | null;

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

export const requireOpenedPath = (error: string) => {
	if (error) throw new Error(error);
};

export const updateSummary = (status: UpdateStatus): UpdateSummary => ({
	state: status.state,
	detail: status.detail,
	version: status.available.manifest.version,
	release: status.available.manifest.id.slice(0, 12),
	protocol: status.available.manifest.protocol,
});
