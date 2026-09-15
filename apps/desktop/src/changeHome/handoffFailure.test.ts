import { expect, test } from "bun:test";
import { handoffFailure } from "./handoffFailure.ts";

test("a later failure identifies the prepared home, backup, and service restoration commands", () => {
	const detail = handoffFailure(new Error("Current worker did not stop"), {
		home: "/existing",
		backupPath: "/existing/backups/saved",
		automationPaused: true,
		restoreCommands: [{ command: "launchctl", args: ["enable", "gui/501/com.trellis.server"] }],
	});
	expect(detail).toContain("Current worker did not stop");
	expect(detail).toContain("/existing/backups/saved");
	expect(detail).toContain("automation is paused");
	expect(detail).toContain("'launchctl' 'enable' 'gui/501/com.trellis.server'");
});
