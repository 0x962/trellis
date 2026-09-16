// apps/desktop/src/preload.ts exposes window.trellisDesktop in the macOS app.
// These types copy the desktop IPC contract because the web app cannot import
// the desktop package.
export type DesktopAction =
	| "chooseDataDirectory"
	| "showDataDirectory"
	| "openServiceSettings"
	| "stopLocalWork"
	| "resumeLocalWork"
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
	chooseDirectory: () => Promise<string | null>;
	status: () => Promise<DesktopStatus>;
	serviceStatus: () => Promise<DesktopServiceStatus>;
	updateStatus: () => Promise<DesktopUpdateStatus>;
	setOpenAtLogin: (enabled: boolean) => Promise<void>;
	run: (action: DesktopAction) => Promise<void>;
	onNavigate?: (listener: (path: string) => void) => () => void;
};

// The host serves the web app from its own release, and the macOS app supplies
// the bridge. The Desktop section appears only when the app supplies each call
// that the section uses.
export function desktopSettingsBridge(bridge: Partial<DesktopBridge> | undefined): DesktopBridge | undefined {
	return typeof bridge?.status === "function" &&
		typeof bridge.serviceStatus === "function" &&
		typeof bridge.updateStatus === "function" &&
		typeof bridge.setOpenAtLogin === "function" &&
		typeof bridge.run === "function"
		? (bridge as DesktopBridge)
		: undefined;
}

// Electron puts "Error invoking remote method '<channel>': Error: " before the
// message that the main process threw.
export function desktopErrorMessage(error: Error): string {
	return error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}
