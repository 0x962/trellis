import { expect, test } from "bun:test";
import { restartMenuItem } from "./restartMenuItem.ts";

test("relaunches before it exits", () => {
	const calls: string[] = [];
	const item = restartMenuItem({
		relaunch: () => calls.push("relaunch"),
		exit: (code) => calls.push(`exit:${code}`),
	});

	item.click();

	expect(calls).toEqual(["relaunch", "exit:0"]);
});
