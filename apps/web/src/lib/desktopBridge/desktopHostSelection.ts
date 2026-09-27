import type {
	DataHomeId,
	HostId,
	HostProfile,
	HostProfileAddInput,
	HostProfileEditInput,
	HostProfileId,
	HostProfileRemoveInput,
	HostProfileTrustKeyInput,
} from "@trellis/api";

export type DesktopHostConnection = "disconnected" | "connecting" | "connected" | "error";

export type DesktopHostState = {
	selectedProfileId: HostProfileId | null;
	connection: DesktopHostConnection;
	verifiedHostId: HostId | null;
	verifiedDataHomeId: DataHomeId | null;
	error: string | null;
};

export type DesktopHostSelectionBridge = {
	list: () => Promise<HostProfile[]>;
	add: (input: HostProfileAddInput) => Promise<HostProfile>;
	edit: (input: HostProfileEditInput) => Promise<HostProfile>;
	trustKey: (input: HostProfileTrustKeyInput) => Promise<HostProfile>;
	remove: (input: HostProfileRemoveInput) => Promise<void>;
	switchHost: (profileId: HostProfileId) => Promise<void>;
	state: () => Promise<DesktopHostState>;
};

export type DesktopHostSelectionWindow = Window & {
	trellisHostSelection?: Partial<DesktopHostSelectionBridge>;
};

const desktopHostSelectionMethods = [
	"list",
	"add",
	"edit",
	"trustKey",
	"remove",
	"switchHost",
	"state",
] as const;

const isDesktopHostSelectionBridge = (
	bridge: Partial<DesktopHostSelectionBridge> | undefined,
): bridge is DesktopHostSelectionBridge =>
	bridge !== undefined && desktopHostSelectionMethods.every((method) => typeof bridge[method] === "function");

export const readDesktopHostSelection = (
	target: DesktopHostSelectionWindow = window as DesktopHostSelectionWindow,
): DesktopHostSelectionBridge | undefined => {
	const bridge = target.trellisHostSelection;
	return isDesktopHostSelectionBridge(bridge) ? bridge : undefined;
};
