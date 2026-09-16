import { expect, mock, test } from "bun:test";
import { restartManager } from "./restartManager";

const input = { id: "manager", project: "APP", personaId: "saved-persona" };

test("a fresh conversation waits for the manager stop to succeed", async () => {
	let confirmStop!: () => void;
	const stopped = new Promise<void>((resolve) => {
		confirmStop = resolve;
	});
	const stop = mock(() => stopped);
	const start = mock(async () => ({ id: "manager", sessionId: "fresh" }));
	const restart = restartManager({ stop, start }, input);
	expect(stop).toHaveBeenCalledWith({ id: "manager" });
	expect(start).not.toHaveBeenCalled();
	confirmStop();
	expect(await restart).toEqual({ id: "manager", sessionId: "fresh" });
	expect(start).toHaveBeenCalledTimes(1);
	expect(start).toHaveBeenCalledWith({ project: "APP", personaId: "saved-persona", newSession: true });
});

test("a failed stop cannot start a fresh conversation", async () => {
	const error = new Error("The runtime cannot confirm the manager stopped.");
	const start = mock(async () => ({ id: "manager" }));
	await expect(
		restartManager(
			{
				stop: async () => {
					throw error;
				},
				start,
			},
			input,
		),
	).rejects.toBe(error);
	expect(start).not.toHaveBeenCalled();
});

test("a failed fresh start reports the failure without another stop or launch", async () => {
	const stop = mock(async () => undefined);
	const error = new Error("The harness is unavailable.");
	const start = mock(async () => {
		throw error;
	});
	await expect(restartManager({ stop, start }, input)).rejects.toBe(error);
	expect(stop).toHaveBeenCalledTimes(1);
	expect(start).toHaveBeenCalledTimes(1);
});
