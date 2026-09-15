import { expect, test } from "bun:test";
import {
	type StopCurrentServiceActions,
	stopCurrentService,
} from "../../../../src/stopCurrentService/stopCurrentService.ts";

const host = { pid: 123, origin: "http://127.0.0.1:1234", token: "fixture" };
const fixture = () => {
	const calls: string[] = [];
	const actions: StopCurrentServiceActions = {
		status: async () => "enabled",
		configuredHome: async () => "/current",
		inspect: async () => ({ host: null, runtimeActive: false }),
		stopWork: async (_host, stop) => {
			calls.push("stop work");
			await stop();
		},
		unregister: async () => {
			calls.push("unregister");
		},
		wait: async () => {
			calls.push("wait");
		},
	};
	return { actions, calls };
};

test("a connected host stops its work before its service", async () => {
	const { actions, calls } = fixture();
	await stopCurrentService({ home: "/current", host, helper: "fixture" }, actions);
	expect(calls).toEqual(["stop work", "unregister", "wait"]);
});

test("an unregistered service does not inspect or create a data home", async () => {
	const { actions, calls } = fixture();
	actions.status = async () => "notRegistered";
	actions.configuredHome = async () => {
		throw new Error("must not inspect");
	};
	await stopCurrentService({ home: "/missing", helper: "fixture" }, actions);
	expect(calls).toEqual([]);
});

test("a verified host can stop after initial adoption failed", async () => {
	const { actions, calls } = fixture();
	actions.inspect = async () => ({ host, runtimeActive: true });
	await stopCurrentService({ home: "/current", helper: "fixture" }, actions);
	expect(calls).toEqual(["stop work", "unregister", "wait"]);
});

test("a registered service with no process or runtime stops without a launch", async () => {
	const { actions, calls } = fixture();
	await stopCurrentService({ home: "/current", helper: "fixture" }, actions);
	expect(calls).toEqual(["unregister", "wait"]);
});

test("a different configured home blocks service changes", async () => {
	const { actions, calls } = fixture();
	actions.configuredHome = async () => "/other";
	await expect(stopCurrentService({ home: "/current", helper: "fixture" }, actions)).rejects.toThrow("configured");
	expect(calls).toEqual([]);
});

test("a runtime without a verified host blocks service changes", async () => {
	const { actions, calls } = fixture();
	actions.inspect = async () => ({ host: null, runtimeActive: true });
	await expect(stopCurrentService({ home: "/current", helper: "fixture" }, actions)).rejects.toThrow(
		"execution service",
	);
	expect(calls).toEqual([]);
});

test("unknown ownership blocks service changes", async () => {
	const { actions, calls } = fixture();
	actions.inspect = async () => {
		throw new Error("Unknown live owner");
	};
	await expect(stopCurrentService({ home: "/current", helper: "fixture" }, actions)).rejects.toThrow(
		"Unknown live owner",
	);
	expect(calls).toEqual([]);
});

test("a runtime that appears during unregister prevents a directory switch", async () => {
	const { actions, calls } = fixture();
	let inspected = 0;
	actions.inspect = async () => ({ host: null, runtimeActive: ++inspected > 1 });
	await expect(stopCurrentService({ home: "/current", helper: "fixture" }, actions)).rejects.toThrow(
		"execution service",
	);
	expect(calls).toEqual(["unregister", "wait"]);
});

test("a fresh bundle with no service registration can select existing data", async () => {
	const { actions, calls } = fixture();
	actions.status = async () => "notFound";
	actions.configuredHome = async () => {
		throw new Error("must not inspect");
	};
	await stopCurrentService({ home: "/missing", helper: "fixture" }, actions);
	expect(calls).toEqual([]);
});
