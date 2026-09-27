import { expect, test } from "bun:test";
import { resolveLinuxExecutable } from "./launcher.ts";

test("a bare command requires PATH", () => {
	expect(() =>
		resolveLinuxExecutable("agent", "/work", {}, { executable: "/release/bin/node", canExecute: () => true }),
	).toThrow("PATH is required to find executable agent");
});

test("an explicit empty PATH entry searches the current directory", () => {
	const inspected: string[] = [];
	expect(
		resolveLinuxExecutable(
			"agent",
			"/work",
			{ PATH: ":/bin" },
			{
				executable: "/release/bin/node",
				canExecute(path) {
					inspected.push(path);
					return path === "/work/agent";
				},
			},
		),
	).toBe("/work/agent");
	expect(inspected).toEqual(["/work/agent"]);
});
