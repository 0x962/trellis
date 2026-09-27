import { expect, test } from "bun:test";
import type { HostProfile, HostProfileId } from "@trellis/api";
import type {
	DesktopHostSelectionBridge,
	DesktopHostSelectionWindow,
	DesktopHostState,
} from "./desktopHostSelection";
import { readDesktopHostSelection } from "./desktopHostSelection";

const state: DesktopHostState = {
	selectedProfileId: null,
	connection: "disconnected",
	verifiedHostId: null,
	verifiedDataHomeId: null,
	error: null,
};

const profile: HostProfile = {
	id: "00000000-0000-4000-8000-000000000001" as HostProfileId,
	kind: "local",
	label: "Local host",
	dataHome: "/tmp/trellis-host",
	expectedHostId: null,
	expectedDataHomeId: null,
};

const bridge = {
	list: () => Promise.resolve([profile]),
	add: () => Promise.resolve(profile),
	edit: () => Promise.resolve(profile),
	trustKey: () => Promise.resolve(profile),
	remove: () => Promise.resolve(),
	switchHost: () => Promise.resolve(),
	state: () => Promise.resolve(state),
} satisfies DesktopHostSelectionBridge;

const bridgeWindow = (trellisHostSelection?: DesktopHostSelectionWindow["trellisHostSelection"]) =>
	({ trellisHostSelection }) as DesktopHostSelectionWindow;

test("reads the complete host selection bridge", () => {
	expect(readDesktopHostSelection(bridgeWindow(bridge))).toBe(bridge);
});

test("rejects an incomplete host selection bridge", () => {
	expect(readDesktopHostSelection(bridgeWindow({ ...bridge, switchHost: undefined }))).toBeUndefined();
});
