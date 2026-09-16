import { expect, test } from "bun:test";
import { desktopErrorMessage, desktopSettingsBridge } from "./desktopBridge.ts";

test("only a desktop bridge with the status call enables the Desktop settings", () => {
	const bridge = {
		platform: "darwin",
		chooseDirectory: async () => null,
		status: async () => {
			throw new Error("unused");
		},
		serviceStatus: async () => null,
		updateStatus: async () => null,
		setOpenAtLogin: async () => {},
		run: async () => {},
		onNavigate: () => () => {},
	};
	expect(desktopSettingsBridge(bridge)).toBe(bridge);
	expect(desktopSettingsBridge({ platform: "darwin", chooseDirectory: async () => null })).toBeUndefined();
	expect(desktopSettingsBridge({ ...bridge, serviceStatus: undefined })).toBeUndefined();
	expect(desktopSettingsBridge(undefined)).toBeUndefined();
});

test("a desktop error shows the message of the main process without the IPC prefix", () => {
	expect(
		desktopErrorMessage(
			new Error("Error invoking remote method 'trellis:desktop-action': Error: Local work stays paused."),
		),
	).toBe("Local work stays paused.");
	expect(desktopErrorMessage(new Error("The host did not answer."))).toBe("The host did not answer.");
});
