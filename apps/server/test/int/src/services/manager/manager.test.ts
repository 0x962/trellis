import { expect, test } from "bun:test";
import { manage } from "../../../../../src/services/manager/manager.ts";

const ctx = {} as Parameters<typeof manage>[0];
test("deterministic management starts, recovers and prompts builders without a manager persona", async () => {
	const calls: string[] = [];
	await manage(
		ctx,
		{ sessions: [] },
		{
			starts: async () => {
				calls.push("start");
			},
			heartbeats: async () => {
				calls.push("heartbeat");
			},
			recovery: async () => {
				calls.push("recover");
			},
		},
	);
	expect(calls.sort()).toEqual(["heartbeat", "recover", "start"]);
});

test("a failed start does not suppress recovery or heartbeats", async () => {
	const calls: string[] = [];
	await expect(
		manage(
			ctx,
			{ sessions: [] },
			{
				starts: async () => {
					throw new Error("Launch failed");
				},
				heartbeats: async () => {
					calls.push("heartbeat");
				},
				recovery: async () => {
					calls.push("recover");
				},
			},
		),
	).rejects.toThrow("Launch failed");
	expect(calls.sort()).toEqual(["heartbeat", "recover"]);
});
