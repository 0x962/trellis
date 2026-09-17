import { expect, test } from "bun:test";
import type { MessageBoxOptions } from "electron";
import { type StartupFailure, showStartupError } from "./showStartupError.ts";

const show = async (failure: StartupFailure) => {
	const shown: MessageBoxOptions[] = [];
	let quits = 0;
	await showStartupError(
		{
			message: async (options) => {
				shown.push(options);
				return { response: 0 };
			},
			quit: () => {
				quits += 1;
			},
		},
		failure,
	);
	return { options: shown[0]!, quits };
};

test("the dialog names the step, the failure, and the host log", async () => {
	const { options, quits } = await show({
		error: new Error("The background service did not become ready."),
		step: { phase: "Restore local services", stage: "Resume saved agents" },
		home: "/data/trellis",
	});

	expect(options.message).toBe("Trellis cannot start");
	expect(options.detail).toBe(
		"Restore local services: Resume saved agents did not finish.\n\nThe background service did not become ready.\n\nRead /data/trellis/desktop-host.log for the host output.",
	);
	expect(options.buttons).toEqual(["Quit"]);
	expect(quits).toBe(1);
});

test("a stage that repeats its phase name appears once", async () => {
	const { options } = await show({
		error: new Error("The release hash does not match."),
		step: { phase: "Prepare restart", stage: "Prepare restart" },
		home: "/data/trellis",
	});

	expect(options.detail).toBe(
		"Prepare restart did not finish.\n\nThe release hash does not match.\n\nRead /data/trellis/desktop-host.log for the host output.",
	);
});

test("an unknown data directory leaves out the log line", async () => {
	const { options } = await show({
		error: new Error("The selected Trellis data directory is invalid."),
		step: { phase: "Prepare app", stage: "Prepare Trellis" },
	});

	expect(options.detail).toBe(
		"Prepare app: Prepare Trellis did not finish.\n\nThe selected Trellis data directory is invalid.",
	);
});

test("a failure before the first step shows the message alone", async () => {
	const { options } = await show({ error: new Error("The progress window did not open.") });

	expect(options.detail).toBe("The progress window did not open.");
});
