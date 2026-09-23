import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptSessionInput } from "../acceptSessionInput";
import { observeHarness } from "../observeHarness.ts";
import type { SessionRecord } from "../sessionRecord.ts";
import { sessionResources } from "../sessionResources.ts";
import { expireIdleSessions } from "./idleCleanup.ts";

const now = Date.parse("2026-09-23T12:00:00Z");
const timeout = 5 * 60 * 1000;
let home: string;
let record: SessionRecord;
let stops: number;
let saves: number;
const save = () => saves++;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "trellis-idle-test-"));
	stops = 0;
	saves = 0;
	record = {
		session: {
			id: "attempt",
			daemonId: "test",
			pid: process.pid,
			mode: "pty",
			status: "running",
			startedAt: new Date(now - timeout * 2).toISOString(),
			endedAt: null,
			exitCode: null,
			error: null,
		},
		fingerprint: null,
		identity: null,
		launch: { command: "test", args: [], cwd: home },
		listeners: new Set(),
		watchedPids: new Set(),
		tokenHash: createHash("sha256").update("token").digest(),
		activity: null,
		...sessionResources(home, "attempt"),
		process: {
			pid: process.pid,
			input: async () => {},
			resize: () => {},
			pauseOutput: () => {},
			resumeOutput: () => {},
			stop: () => {
				stops++;
			},
		},
		stopped: Promise.resolve(undefined),
		resolveStop: () => {},
	};
	observeHarness(record, { kind: "prompt", sessionId: "saved-conversation", prompt: "trellis-message:attempt\nWork" });
	observeHarness(record, { kind: "idle", outcome: "completed", result: "Done" });
	record.activity = { state: "idle", updatedAt: new Date(now - timeout - 1).toISOString() };
});

afterEach(async () => {
	await Promise.all([record.log.finish(), record.stderr.finish(), record.observations.log.finish()]);
	rmSync(home, { recursive: true, force: true });
});

test("stops after five idle minutes and retains the saved conversation", () => {
	record.activity!.updatedAt = new Date(now - timeout).toISOString();
	expireIdleSessions([record], save, now);
	expect(stops).toBe(0);
	expireIdleSessions([record], save, now + 1);
	expect(stops).toBe(1);
	expect(saves).toBe(1);
	expect(record.session.stopReason).toBe("idle");
	expect(record.retainForResume).toBe(true);
	expect(record.observations.agent!.sessionId).toBe("saved-conversation");
	expect(record.completion.latest?.text).toBe("Done");
	expireIdleSessions([record], save, now + timeout);
	expect(stops).toBe(1);
});

test.each(["working", "ready"] as const)("keeps an old %s observation alive", (state) => {
	record.activity!.state = state;
	expireIdleSessions([record], save, now);
	expect(stops).toBe(0);
});

test("keeps a process without an idle observation or confirmed conversation", () => {
	record.activity = null;
	expireIdleSessions([record], save, now);
	record.activity = { state: "idle", updatedAt: new Date(now - timeout - 1).toISOString() };
	record.observations.agent!.sessionId = null;
	expireIdleSessions([record], save, now);
	expect(stops).toBe(0);
});

test("keeps an unresolved question and an active tool alive", () => {
	record.observations.agent!.attention!.requests.push({
		id: "question",
		kind: "question",
		title: "Choose",
		blocking: true,
		sequence: 1,
		at: new Date(now).toISOString(),
	});
	expireIdleSessions([record], save, now);
	record.observations.agent!.attention!.requests = [];
	record.observations.agent!.tool = { id: "tool", name: "shell" };
	expireIdleSessions([record], save, now);
	expect(stops).toBe(0);
});

test("a native message accepted before cleanup prevents a stop until its receipt", () => {
	record.ledger.registerNative("followup", "digest", () => acceptSessionInput(record));
	record.lastInputAt = now - timeout - 1;
	expireIdleSessions([record], save, now);
	expect(stops).toBe(0);
	record.ledger.acknowledge("followup");
	expireIdleSessions([record], save, now);
	expect(stops).toBe(1);
});

test("a queued terminal message also prevents a stop until its receipt", async () => {
	await record.ledger.deliver("followup", Buffer.from("message").toString("base64"), async () => {});
	expireIdleSessions([record], save, now);
	expect(stops).toBe(0);
	record.ledger.acknowledge("followup");
	expireIdleSessions([record], save, now);
	expect(stops).toBe(1);
});

test("recent human input delays cleanup but a terminal response does not", () => {
	acceptSessionInput(record);
	expireIdleSessions([record], save, record.lastInputAt! + timeout);
	expect(stops).toBe(0);
	const inputAt = record.lastInputAt!;
	acceptSessionInput(record, false);
	expect(record.lastInputAt).toBe(inputAt);
	expireIdleSessions([record], save, inputAt + timeout + 1);
	expect(stops).toBe(1);
});

test("a message after cleanup starts fails before it reserves delivery", () => {
	expireIdleSessions([record], save, now);
	expect(() => record.ledger.registerNative("late", "digest", () => acceptSessionInput(record))).toThrow(
		"Resume its saved conversation",
	);
	expect(record.ledger.has("late")).toBe(false);
	expect(() => acceptSessionInput(record)).toThrow("Resume its saved conversation");
});

test("a working event before the sweep cancels expiry", () => {
	observeHarness(record, { kind: "working", turnId: "next" });
	expireIdleSessions([record], save, now + timeout * 10);
	expect(stops).toBe(0);
});
