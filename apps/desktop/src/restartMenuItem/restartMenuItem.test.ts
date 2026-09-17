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

test("restarts the development host before it relaunches", async () => {
	const calls: string[] = [];
	let finishRestart!: () => void;
	const restart = new Promise<void>((resolve) => {
		finishRestart = resolve;
	});
	const item = restartMenuItem(
		{
			relaunch: () => calls.push("relaunch"),
			exit: (code) => calls.push(`exit:${code}`),
		},
		{
			restart: () => {
				calls.push("restart");
				return restart;
			},
			showError: (error) => calls.push(`error:${error.message}`),
		},
	);

	const click = item.click();
	expect(calls).toEqual(["restart"]);
	finishRestart();
	await click;

	expect(calls).toEqual(["restart", "relaunch", "exit:0"]);
});
