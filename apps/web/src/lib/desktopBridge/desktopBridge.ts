// window.trellisDesktop, which apps/desktop/src/preload.ts exposes in the
// macOS app. These types copy DesktopAction and DesktopStatus from
// apps/desktop/src/desktopSettings, because the web app cannot import the
// desktop package.
export type DesktopAction =
	| "chooseDataDirectory"
	| "showDataDirectory"
	| "openServiceSettings"
	| "stopLocalWork"
	| "resumeLocalWork"
	| "reconnectHost"
	| "quit";

export type DesktopServiceStatus = "notRegistered" | "enabled" | "requiresApproval" | "notFound" | "unknown";
export type DesktopUpdateState = "current" | "restart-required" | "blocked";

export type DesktopStatus = {
	packaged: boolean;
	dataDirectory: string;
	openAtLogin: boolean;
	// The development app has no background service and no package, so both are null.
	service: DesktopServiceStatus | null;
	update: { state: DesktopUpdateState; detail: string; version: string; release: string; protocol: number } | null;
};

export type DesktopBridge = {
	platform: string;
	chooseDirectory: () => Promise<string | null>;
	status: () => Promise<DesktopStatus>;
	setOpenAtLogin: (enabled: boolean) => Promise<void>;
	run: (action: DesktopAction) => Promise<void>;
};

// The host serves the web app from its own release, and the macOS app
// supplies the bridge. An older app can run with a newer host, and its bridge
// has no status call, so the Settings page shows no Desktop section for it.
export function desktopSettingsBridge(bridge: Partial<DesktopBridge> | undefined): DesktopBridge | undefined {
	return typeof bridge?.status === "function" ? (bridge as DesktopBridge) : undefined;
}

// Electron puts "Error invoking remote method '<channel>': Error: " before the
// message that the main process threw.
export function desktopErrorMessage(error: Error): string {
	return error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}
