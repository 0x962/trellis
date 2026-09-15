import { expect, test } from "bun:test";
import { changeHome, type HomeChangeActions } from "./changeHome.ts";

const fixture = () => {
	const calls: string[] = [];
	const actions: HomeChangeActions = {
		choose: async () => "/existing",
		inspect: async () => ({ home: "/existing", owner: null, runtime: null }),
		prepare: async () => {
			calls.push("prepare");
		},
		confirm: async () => true,
		stopCurrent: async () => {
			calls.push("stop");
		},
		persist: async (home) => {
			calls.push(`persist:${home}`);
		},
		start: async () => {
			calls.push("start");
		},
		startFailed: async () => {
			calls.push("start failed");
		},
		relaunch: () => {
			calls.push("relaunch");
		},
	};
	return { calls, actions };
};

test("directory change preserves both homes and orders the owner handoff before selection", async () => {
	const { calls, actions } = fixture();
	expect(await changeHome("/current", actions)).toBe(true);
	expect(calls).toEqual(["prepare", "stop", "persist:/existing", "start", "relaunch"]);
});

for (const cancellation of ["picker", "same directory", "confirmation"]) {
	test(`${cancellation} leaves the current service and selection alone`, async () => {
		const { calls, actions } = fixture();
		if (cancellation === "picker") actions.choose = async () => null;
		if (cancellation === "same directory")
			actions.inspect = async () => ({ home: "/current", owner: null, runtime: null });
		if (cancellation === "confirmation") actions.confirm = async () => false;
		expect(await changeHome("/current", actions)).toBe(false);
		expect(calls).toEqual([]);
	});
}

test("a failed target handoff leaves the current host and selection alone", async () => {
	const { calls, actions } = fixture();
	actions.prepare = async () => {
		throw new Error("Target remains owned");
	};
	await expect(changeHome("/current", actions)).rejects.toThrow("Target remains owned");
	expect(calls).toEqual([]);
});

test("a failed current stop never changes the selected home", async () => {
	const { calls, actions } = fixture();
	actions.stopCurrent = async () => {
		throw new Error("Worker remains active");
	};
	await expect(changeHome("/current", actions)).rejects.toThrow("Worker remains active");
	expect(calls).toEqual(["prepare"]);
});

test("an owner that appears after confirmation blocks persistence", async () => {
	const { calls, actions } = fixture();
	let inspections = 0;
	actions.inspect = async () => ({
		home: "/existing",
		owner: ++inspections > 1 ? { pid: 123, role: "server", port: 4521 } : null,
		runtime: null,
	});
	await expect(changeHome("/current", actions)).rejects.toThrow("still owns");
	expect(calls).toEqual(["prepare", "stop"]);
});

test("registration failure reports the saved selection and reopens startup recovery", async () => {
	const { calls, actions } = fixture();
	actions.start = async () => {
		throw new Error("macOS refused registration");
	};
	actions.startFailed = async (error) => {
		expect((error as Error).message).toBe("macOS refused registration");
		calls.push("saved directory needs service");
	};
	expect(await changeHome("/current", actions)).toBe(true);
	expect(calls).toEqual(["prepare", "stop", "persist:/existing", "saved directory needs service", "relaunch"]);
});

test("a directory replaced after confirmation cannot redirect the saved selection", async () => {
	const { calls, actions } = fixture();
	let inspections = 0;
	actions.inspect = async () => ({
		home: ++inspections > 1 ? "/replacement" : "/existing",
		owner: null,
		runtime: null,
	});
	await expect(changeHome("/current", actions)).rejects.toThrow("directory changed");
	expect(calls).toEqual(["prepare", "stop"]);
});
