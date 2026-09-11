import { expect, test } from "bun:test";
import { chooseDirectory } from "./chooseDirectory";

test("the folder selector returns the absolute path with spaces intact", async () => {
	const selected = await chooseDirectory(async (file, args) => {
		expect(file).toBe("/usr/bin/osascript");
		expect(args.join(" ")).toContain("choose folder");
		expect(args.join(" ")).toContain("on error number -128");
		return { stdout: "/Users/navidkhan/projects/My Project/\n" };
	});
	expect(selected).toBe("/Users/navidkhan/projects/My Project/");
});

test("cancel returns null", async () => {
	expect(await chooseDirectory(async () => ({ stdout: "\n" }))).toBeNull();
});

test("dialog errors reach the caller", async () => {
	await expect(
		chooseDirectory(async () => {
			throw new Error("Dialog unavailable");
		}),
	).rejects.toThrow("Dialog unavailable");
});
