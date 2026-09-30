import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeCaptureRequest } from "@trellis/runtime-protocol";
import { readRuntimeCaptureHold } from "@trellis/runtime-protocol/mutation-exclusion";
import {
	completeRuntimeCaptureHold,
	readRuntimeCaptureFinalization,
	retainRuntimeCaptureHold,
} from "./captureHold.ts";

let home: string;

beforeEach(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-runtime-capture-finalization-"));
});

afterEach(async () => rm(home, { recursive: true, force: true }));

const request = (captureId = "capture-1"): RuntimeCaptureRequest => ({
	captureId,
	snapshotId: "snapshot-1",
	hostId: "host-1",
	dataHomeId: "home-1",
	generation: 1,
	blockId: "block-1",
	identities: [
		{
			harness: "codex",
			accountId: "account-1",
			profileId: "profile-1",
			agentRunId: "run-1",
			attemptId: "attempt-1",
			providerSessionId: "session-1",
		},
	],
});

const retain = (input: RuntimeCaptureRequest) =>
	retainRuntimeCaptureHold(
		home,
		input,
		[{ kind: "provider", directory: join(home, "profiles", "one") }],
		false,
	);

const finalizationPath = (captureId: string) =>
	join(
		home,
		"runtime-capture-finalizations",
		`${createHash("sha256").update(captureId).digest("hex")}.json`,
	);

test.each(["committed", "abandoned"] as const)(
	"reads the retained %s finalization with its original bytes",
	(outcome) => {
		const input = request(`capture-${outcome}`);
		retain(input);
		completeRuntimeCaptureHold(home, { request: input, outcome });
		appendFileSync(finalizationPath(input.captureId), "\n");
		const result = readRuntimeCaptureFinalization(home, input);
		expect(result?.receipt).toMatchObject({ request: input, outcome });
		expect(result?.receiptBytes).toBe(readFileSync(finalizationPath(input.captureId), "utf8"));
		expect(result?.receiptBytes.endsWith("\n")).toBe(true);
	},
);

test("returns null when no receipt or hold exists", () => {
	expect(readRuntimeCaptureFinalization(home, request())).toBeNull();
});

test("returns null without changing a matching durable hold", () => {
	const input = request();
	retain(input);
	const before = readRuntimeCaptureHold(home, input.captureId);
	expect(readRuntimeCaptureFinalization(home, input)).toBeNull();
	expect(readRuntimeCaptureHold(home, input.captureId)).toEqual(before);
});

test("rejects a changed request for a saved receipt or durable hold", () => {
	const held = request("held");
	retain(held);
	expect(() => readRuntimeCaptureFinalization(home, { ...held, snapshotId: "changed" })).toThrow(
		"Capture held has a different request",
	);
	const finalized = request("finalized");
	retain(finalized);
	completeRuntimeCaptureHold(home, { request: finalized, outcome: "committed" });
	expect(() => readRuntimeCaptureFinalization(home, { ...finalized, blockId: "changed" })).toThrow(
		"Capture finalized has a different request",
	);
});
