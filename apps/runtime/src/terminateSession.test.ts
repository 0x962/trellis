import { expect, test } from "bun:test";
import { type SessionOperations, terminateSession } from "./terminateSession";

const fixture = () => {
	let time = 0;
	const groups: number[] = [];
	const operations: SessionOperations = {
		processes: () => [
			{ pid: 101, parent: 1, group: 100, state: "S" },
			{ pid: 102, parent: 1, group: 102, state: "S" },
			{ pid: 201, parent: 1, group: 200, state: "S" },
		],
		sessionOf: (pid) => (pid < 200 ? 100 : 200),
		killGroup: (group) => {
			groups.push(group);
		},
		now: () => time,
		wait: async (ms) => {
			time += ms;
		},
	};
	return { operations, groups };
};
test("session cleanup reaches separate job groups and excludes another session", async () => {
	const { operations, groups } = fixture();
	operations.killGroup = (group) => {
		groups.push(group);
		const previous = operations.processes;
		operations.processes = () => previous().filter((item) => item.group !== group);
	};
	await terminateSession(100, operations);
	expect(groups).toEqual([100, 102]);
});
test("a group with live members cannot become a confirmed exit", async () => {
	const { operations } = fixture();
	await expect(terminateSession(100, operations)).rejects.toThrow("still has live members");
});
test("a failed signal remains an unconfirmed cleanup", async () => {
	const { operations } = fixture();
	operations.killGroup = () => {
		throw new Error("EPERM");
	};
	await expect(terminateSession(100, operations)).rejects.toThrow("EPERM");
});
test("a process which changes session between inspection and signal is not killed", async () => {
	const { operations, groups } = fixture();
	let reads = 0;
	operations.sessionOf = () => (++reads <= 3 ? 100 : 200);
	await terminateSession(100, operations);
	expect(groups).toEqual([]);
});

test("a live leader retains cleanup authority for an observed descendant's new session", async () => {
	const { operations, groups } = fixture();
	operations.processes = () => [
		{ pid: 100, parent: 1, group: 100, state: "S" },
		{ pid: 300, parent: 100, group: 300, state: "S" },
	];
	operations.sessionOf = (pid) => pid;
	operations.killGroup = (group) => {
		groups.push(group);
		const previous = operations.processes;
		operations.processes = () => previous().filter((item) => item.group !== group);
	};
	await terminateSession(100, operations);
	expect(groups).toEqual([100, 300]);
});
test("an identity lookup failure does not establish an empty session", async () => {
	const { operations } = fixture();
	operations.sessionOf = () => {
		throw new Error("getsid EPERM");
	};
	await expect(terminateSession(100, operations)).rejects.toThrow("getsid EPERM");
});
