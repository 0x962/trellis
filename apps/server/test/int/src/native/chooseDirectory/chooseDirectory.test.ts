import { expect, test } from "bun:test";
import type { ORPCError } from "@orpc/server";
import { chooseDirectory } from "../../../../../src/native/chooseDirectory/chooseDirectory";

test("the folder selector returns the absolute path with spaces intact", async () => {
	const selected = await chooseDirectory(async (file, args) => {
		expect(file).toBe("/usr/bin/osascript");
		expect(args.join(" ")).toContain("choose folder");
		expect(args.join(" ")).toContain("on error number -128");
		return { stdout: "/Users/dana/projects/My Project/\n" };
	});
	expect(selected).toBe("/Users/dana/projects/My Project/");
});

test("cancel returns null", async () => {
	expect(await chooseDirectory(async () => ({ stdout: "\n" }))).toBeNull();
});

// osascript runs outside the server. A person who clicks Choose reads why no
// dialog appeared, so the failure is a refusal and not a server failure.
test("a dialog that does not open refuses the request with its reason", async () => {
	const failed = await chooseDirectory(async () => {
		throw new Error("Dialog unavailable");
	}).then(
		() => null,
		(thrown: unknown) => thrown as ORPCError<string, { issues: { message: string; path: string[] }[] }>,
	);

	expect(failed?.code).toBe("INPUT_VALIDATION_FAILED");
	expect(failed?.status).toBe(400);
	expect(failed?.message).toBe("The folder picker did not open: Dialog unavailable");
	expect(failed?.data.issues).toEqual([
		{ message: "The folder picker did not open: Dialog unavailable", path: ["directory"] },
	]);
});
