import { expect, test } from "bun:test";
import type { AgentActivity } from "../schemas/agentActivity.ts";
import type { Settings } from "../schemas/settings.ts";
import type { SessionAlert } from "../sessionAlerts/sessionAlerts.ts";
import { at, session } from "../sessionStatus/fixture.ts";
import { createAgentNotifications } from "./agentNotifications.ts";

const fixture = () => {
	const value: AgentActivity = { run: session().run, sessionId: null };
	value.run.kind = "agent";
	value.run.ticketIdentifier = "OP-32";
	value.run.ticketTitle = "Task";
	let visible = false;
	let active = true;
	const played: number[] = [];
	const shown: SessionAlert[] = [];
	const settings: Settings = { defaultActorName: "test" };
	const notifications = createAgentNotifications({
		active: () => active,
		isVisible: () => visible,
		settings: async () => settings,
		play: async (volume) => {
			played.push(volume);
		},
		show: (alert) => shown.push(alert),
	});
	const finish = async (sequence: number) => {
		value.run.observation!.attention = { sequence, requests: [], completion: { sequence, at }, failure: null };
		value.run.observation!.outcome = "completed";
		await notifications.update(value, true);
	};
	return {
		value,
		notifications,
		finish,
		played,
		shown,
		settings,
		visible: (next: boolean) => {
			visible = next;
		},
		active: (next: boolean) => {
			active = next;
		},
	};
};

test("ticket replies chime once per turn, even within one second and after acknowledgement", async () => {
	const f = fixture();
	await f.notifications.update(f.value, false);
	f.value.run.seenAttention = { attemptId: "attempt", sequence: 10 };
	await f.finish(2);
	await f.finish(2);
	await f.finish(4);
	expect(f.played).toEqual([100, 100]);
	expect(f.shown.map((alert) => alert.path)).toEqual(["/t/OP-32#attempt-attempt", "/t/OP-32#attempt-attempt"]);
});

test("a focused terminal is silent, but background and other terminals chime", async () => {
	const f = fixture();
	f.visible(true);
	await f.finish(2);
	f.visible(false);
	await f.finish(2);
	expect(f.played).toEqual([]);
	await f.finish(4);
	expect(f.played).toEqual([100]);
	f.active(false);
	await f.finish(6);
	expect(f.played).toEqual([100]);
});

test("mute and zero volume suppress sound independently of native banners", async () => {
	const f = fixture();
	f.settings.notifications = { sound: false, volume: 100, native: true };
	await f.finish(2);
	f.settings.notifications = { sound: true, volume: 0, native: true };
	await f.finish(4);
	expect(f.played).toEqual([]);
	expect(f.shown).toHaveLength(2);
	f.settings.notifications = { sound: true, volume: 75, native: false };
	await f.finish(6);
	expect(f.played).toEqual([75]);
	expect(f.shown).toHaveLength(2);
});

test("startup, prompt, output, and process exit stay silent; requests and provider failures chime", async () => {
	const f = fixture();
	await f.notifications.update(f.value, false);
	await f.notifications.update(f.value, true);
	const attention = f.value.run.observation!.attention!;
	attention.sequence = 2;
	await f.notifications.update(f.value, true);
	expect(f.played).toEqual([]);
	attention.sequence = 3;
	attention.requests = [{ id: "permission", kind: "permission", title: "Approve", blocking: true, sequence: 3, at }];
	await f.notifications.update(f.value, true);
	attention.sequence = 4;
	attention.requests = [];
	await f.notifications.update(f.value, true);
	attention.sequence = 5;
	attention.requests = [{ id: "question", kind: "question", title: "Choose", blocking: true, sequence: 5, at }];
	await f.notifications.update(f.value, true);
	attention.sequence = 6;
	attention.requests = [];
	attention.failure = { sequence: 6, at };
	await f.notifications.update(f.value, true);
	f.value.run.state = "failed";
	f.value.run.processStatus = "exited";
	await f.notifications.update(f.value, true);
	expect(f.played).toEqual([100, 100, 100]);
	expect(f.shown.map((alert) => alert.kind)).toEqual(["question", "question", "failed"]);
});

test("session and flow notifications point to their own terminals", async () => {
	const f = fixture();
	f.value.run.kind = "flow";
	await f.finish(2);
	expect(f.shown[0]!.path).toBe("/t/OP-32#attempt-attempt");
	f.value.sessionId = "standalone";
	f.value.run.kind = "session";
	f.value.run.ticketIdentifier = null;
	await f.finish(4);
	expect(f.shown[1]!.path).toBe("/sessions/standalone");
});

test("focus during the settings read suppresses a pending alert", async () => {
	let visible = false;
	let plays = 0;
	const settings = Promise.withResolvers<Settings>();
	const notifications = createAgentNotifications({
		active: () => true,
		isVisible: () => visible,
		settings: () => settings.promise,
		play: async () => {
			plays++;
		},
		show: () => {
			throw new Error("Unexpected banner");
		},
	});
	const value = { run: session().run, sessionId: "session" };
	value.run.observation!.attention!.completion = { sequence: 2, at };
	const delivery = notifications.update(value, true);
	visible = true;
	settings.resolve({ defaultActorName: "test" });
	await delivery;
	expect(plays).toBe(0);
});
