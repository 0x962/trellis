import { expect, test } from "bun:test";
import type { ServiceTransport } from "../../db/transport";
import { protocolDigest } from "../../langflowContracts";
import * as agentTerminal from "../../services/agentRuns/terminal";
import { captureTrellisAndSeal, type TrellisSealInput, type TrellisSealResult } from "../../services/langflowBackup";
import { services } from "../../services/registry";
import { captureTransport } from "./captureTransport";

const input: TrellisSealInput = {
	directory: "/fixture/capture",
	expectedVersion: { trellisRelease: "fixture", trellisDatabaseVersion: "a".repeat(64) },
	block: {
		id: "block",
		dataHomeId: "home",
		generation: 1,
		requestId: "request",
		reason: { kind: "capture", snapshotId: "00000000-0000-4000-8000-000000000001" },
	},
	metadata: {
		snapshotId: "00000000-0000-4000-8000-000000000001",
		sourceDataHomeId: "home",
		sourceHostId: "host",
		createdAt: "2026-09-29T00:00:00.000Z",
		compatibility: {
			trellisRelease: "fixture",
			trellisDatabaseVersion: "a".repeat(64),
			enginePackageDigest: "b".repeat(64),
			engineDatabaseVersion: "engine",
			secretVersion: "secret",
		},
		boundary: { kind: "quiesced-export", receiptId: "capture-receipt" },
		unavailable: [],
	},
};

test("capture uses the real domain in prepare before the automatic result transaction", () => {
	const entry = services["langflowBackup.captureTrellisAndSeal"];
	expect(entry.family).toBe("io");
	expect(entry.kind).toBe("mutation");
	if (!("prepare" in entry)) throw new Error("capture_prepare_missing");
	expect(entry.prepare).toBe(captureTrellisAndSeal);
	expect(entry.run).toBe(agentTerminal.result);
});

test("the capture port awaits one worker call and preserves the exact seal result", async () => {
	const manifest = {
		...input.metadata,
		version: 1 as const,
		capability: "langflow-paired-v1" as const,
		directories: [],
		files: [],
	};
	const manifestBytes = `${JSON.stringify(manifest)}\n`;
	const result: TrellisSealResult = {
		directory: input.directory,
		manifest,
		manifestBytes,
		manifestDigest: protocolDigest(manifestBytes),
		trellis: {
			staging: "/fixture/staging",
			unavailable: [],
			native: { ready: true, unavailable: [] },
			version: input.expectedVersion,
		},
	};
	const calls: unknown[] = [];
	let complete!: (value: TrellisSealResult) => void;
	const pending = new Promise<TrellisSealResult>((resolve) => {
		complete = resolve;
	});
	const transport: Pick<ServiceTransport, "call"> = {
		call: async (name, context, value) => {
			calls.push({ name, actor: context.actor, value });
			return name === "langflowBackup.readTrellisVersion" ? input.expectedVersion : pending;
		},
	};
	const ports = captureTransport(transport);
	expect(await ports.readTrellisVersion()).toBe(input.expectedVersion);
	let returned = false;
	const work = ports.captureTrellisAndSeal(input).then((value) => {
		returned = true;
		return value;
	});
	await Promise.resolve();
	expect(returned).toBe(false);
	complete(result);
	expect(await work).toBe(result);
	expect(calls).toEqual([
		{ name: "langflowBackup.readTrellisVersion", actor: { kind: "system", name: "trellis" }, value: {} },
		{ name: "langflowBackup.captureTrellisAndSeal", actor: { kind: "system", name: "trellis" }, value: input },
	]);
});

test("an uncertain worker response propagates without a second capture call", async () => {
	const failure = new Error("capture_response_lost");
	let calls = 0;
	const ports = captureTransport({
		call: async () => {
			calls++;
			throw failure;
		},
	});
	await expect(ports.captureTrellisAndSeal(input)).rejects.toBe(failure);
	expect(calls).toBe(1);
});
