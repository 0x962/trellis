// apps/desktop/src/preload.ts exposes window.trellisDesktop in the macOS app.
// These types copy the desktop IPC contract because the web app cannot import
// the desktop package.
export type DesktopAction =
	| "chooseDataDirectory"
	| "showDataDirectory"
	| "openServiceSettings"
	| "stopLocalWork"
	| "reconnectHost"
	| "quit";

export type DesktopUpdateState = "current" | "restart-required" | "blocked";

export type DesktopStatus = {
	packaged: boolean;
	dataDirectory: string;
	openAtLogin: boolean;
};

export type DesktopServiceStatus = "notRegistered" | "enabled" | "requiresApproval" | "notFound" | "unknown" | null;
export type DesktopUpdateStatus = {
	state: DesktopUpdateState;
	detail: string;
	version: string;
	release: string;
	protocol: number;
} | null;

export type DesktopBridge = {
	platform: string;
	onAccessibilitySupportChanged?: (listener: (enabled: boolean) => void) => () => void;
	chooseDirectory: () => Promise<string | null>;
	status: () => Promise<DesktopStatus>;
	serviceStatus: () => Promise<DesktopServiceStatus>;
	updateStatus: () => Promise<DesktopUpdateStatus>;
	setOpenAtLogin: (enabled: boolean) => Promise<void>;
	run: (action: DesktopAction) => Promise<void>;
	onNavigate?: (listener: (path: string) => void) => () => void;
};

export type DesktopSettingsBridge = Pick<DesktopBridge, "status" | "setOpenAtLogin" | "run">;

// desktopSettingsBridge requires `status`, `setOpenAtLogin`, and `run` because
// those calls supply and change every value in the Desktop section.
export function desktopSettingsBridge(bridge: Partial<DesktopBridge> | undefined): DesktopSettingsBridge | undefined {
	return typeof bridge?.status === "function" &&
		typeof bridge.setOpenAtLogin === "function" &&
		typeof bridge.run === "function"
		? (bridge as DesktopSettingsBridge)
		: undefined;
}

export function canOpenDesktopSettingsBeforeSetup(
	bridge: Partial<DesktopBridge> | undefined,
	pathname: string,
	hash: string,
): boolean {
	return pathname === "/settings" && hash === "desktop" && desktopSettingsBridge(bridge) !== undefined;
}

// Electron puts "Error invoking remote method '<channel>': Error: " before the
// message that the main process threw.
export function desktopErrorMessage(error: Error): string {
	return error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}
