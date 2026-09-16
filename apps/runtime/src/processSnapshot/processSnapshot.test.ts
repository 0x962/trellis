import { expect, test } from "bun:test";
import { constants } from "node:os";
import { processSnapshot } from "./processSnapshot.ts";

const operations = (overrides: Partial<Parameters<typeof processSnapshot>[0]> = {}) => ({
	listPids: (_type: number, _typeinfo: number, buffer: Buffer | null, _size: number) => {
		if (!buffer) return 8;
		buffer.writeInt32LE(42, 0);
		buffer.writeInt32LE(43, 4);
		return 8;
	},
	pidInfo: (pid: number, flavor: number, arg: number, buffer: Buffer, size: number) => {
		expect({ flavor, arg, size }).toEqual({ flavor: 13, arg: 1, size: 64 });
		buffer.writeUInt32LE(pid, 0);
		buffer.writeUInt32LE(pid - 1, 4);
		buffer.writeUInt32LE(42, 8);
		buffer.writeUInt32LE(pid === 42 ? 2 : 5, 12);
		return 64;
	},
	errno: () => constants.errno.EPERM,
	...overrides,
});

test("the snapshot preserves parent, group, and zombie state from proc_bsdshortinfo", () => {
	expect(processSnapshot(operations())).toEqual([
		{ pid: 42, parent: 41, group: 42, state: "live" },
		{ pid: 43, parent: 42, group: 42, state: "Z" },
	]);
});

test.each([0, -1])("a failed PID size query (%i) throws", (size) => {
	expect(() => processSnapshot(operations({ listPids: () => size }))).toThrow("proc_listpids");
});

test.each([0, -1, 7, 16, 20])("an incomplete PID list (%i bytes) throws", (count) => {
	expect(() => processSnapshot(operations({ listPids: (_type, _typeinfo, buffer) => (buffer ? count : 8) }))).toThrow(
		"proc_listpids",
	);
});

test("a process that exits after enumeration is absent", () => {
	expect(processSnapshot(operations({ pidInfo: () => 0, errno: () => constants.errno.ESRCH }))).toEqual([]);
});

test.each([0, -1, 60])("an unreadable process (%i bytes) throws", (count) => {
	expect(() => processSnapshot(operations({ pidInfo: () => count }))).toThrow("proc_pidinfo(42)");
});

test("a short process record throws even when errno retains ESRCH", () => {
	expect(() => processSnapshot(operations({ pidInfo: () => 60, errno: () => constants.errno.ESRCH }))).toThrow(
		"proc_pidinfo(42)",
	);
});
