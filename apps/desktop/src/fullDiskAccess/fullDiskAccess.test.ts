import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askForFullDiskAccess, fullDiskAccessPane, hasFullDiskAccess } from "./fullDiskAccess.ts";

const setup = (options: { granted: boolean; response?: number; checkbox?: boolean }) => {
	const declinedFile = join(mkdtempSync(join(tmpdir(), "trellis-access-")), "declined");
	const calls: string[] = [];
	const input = {
		granted: async () => options.granted,
		declinedFile,
		message: async () => {
			calls.push("message");
			return { response: options.response ?? 1, checkboxChecked: options.checkbox ?? false };
		},
		openSettings: async (url: string) => {
			calls.push(url);
		},
	};
	return { input, calls, declinedFile };
};

test("shows nothing when Trellis has Full Disk Access", async () => {
	const { input, calls } = setup({ granted: true });
	await askForFullDiskAccess(input);
	expect(calls).toEqual([]);
});

test("opens the Full Disk Access pane when the person asks for it", async () => {
	const { input, calls, declinedFile } = setup({ granted: false, response: 0 });
	await askForFullDiskAccess(input);
	expect(calls).toEqual(["message", fullDiskAccessPane]);
	expect(existsSync(declinedFile)).toBe(false);
});

test("never asks again after the person checks the box", async () => {
	const { input, calls, declinedFile } = setup({ granted: false, response: 1, checkbox: true });
	await askForFullDiskAccess(input);
	await askForFullDiskAccess(input);
	expect(calls).toEqual(["message"]);
	expect(existsSync(declinedFile)).toBe(true);
});

test("does not ask when an earlier launch recorded the refusal", async () => {
	const { input, calls, declinedFile } = setup({ granted: false });
	writeFileSync(declinedFile, "");
	await askForFullDiskAccess(input);
	expect(calls).toEqual([]);
});

test("raises an error other than the macOS refusal", async () => {
	const home = mkdtempSync(join(tmpdir(), "trellis-home-"));
	await expect(hasFullDiskAccess(home)).rejects.toMatchObject({ code: "ENOENT" });
});
