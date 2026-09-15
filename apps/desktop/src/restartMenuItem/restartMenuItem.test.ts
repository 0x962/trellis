import { expect, test } from "bun:test";
import { restartMenuItem } from "./restartMenuItem.ts";

test("Restart waits for the host before it relaunches and quits the desktop", async () => {
	const calls: string[] = [];
	const ready = Promise.withResolvers<void>();
	const item = restartMenuItem(
		{ relaunch: () => calls.push("relaunch"), quit: () => calls.push("quit") },
		async () => {
			calls.push("restart host");
			await ready.promise;
		},
		() => calls.push("error"),
		{
			show: async (stage) => {
				calls.push(stage);
			},
			close: () => calls.push("close progress"),
		},
	);
	const nativeItem = { enabled: true };

	expect(item.label).toBe("Restart");
	expect(calls).toEqual([]);
	const pending = item.click(nativeItem);
	expect(nativeItem.enabled).toBe(false);
	await Promise.resolve();
	expect(calls).toEqual(["Prepare restart", "restart host"]);
	ready.resolve();
	await pending;
	expect(calls).toEqual(["Prepare restart", "restart host", "Relaunch desktop", "relaunch", "quit"]);
});

test("a failed host restart leaves the desktop open and reports the error", async () => {
	const calls: string[] = [];
	const item = restartMenuItem(
		{ relaunch: () => calls.push("relaunch"), quit: () => calls.push("quit") },
		async () => {
			throw new Error("Package update is blocked");
		},
		(error) => calls.push(error.message),
		{
			show: async (stage) => {
				calls.push(stage);
			},
			close: () => calls.push("close progress"),
		},
	);
	const nativeItem = { enabled: true };
	await item.click(nativeItem);
	expect(nativeItem.enabled).toBe(true);
	expect(calls).toEqual(["Prepare restart", "close progress", "Package update is blocked"]);
});
