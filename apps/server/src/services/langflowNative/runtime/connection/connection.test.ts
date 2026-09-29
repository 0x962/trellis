import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DispatchGate, type TerminalReceipt } from "../../../../langflowHost";
import type { NativeRuntimePort, NativeRuntimeRow } from "../contracts";
import { completionFixture } from "../fixture";
import { createNativeRuntimeConnection } from "./connection";

test("startup recovers only reserved attempts and observes canceled or unknown attempts without replacement", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-native-runtime-unit-"));
	const f = completionFixture();
	const calls: string[] = [];
	const rows: NativeRuntimeRow[] = [
		{ ...f.row, stepId: "reserved", handle: { ...f.row.handle, stepId: "reserved", state: "reserved" } },
		{ ...f.row, stepId: "unknown", handle: { ...f.row.handle, stepId: "unknown", state: "unknown" } },
		{
			...f.row,
			stepId: "canceled",
			canceled: true,
			handle: { ...f.row.handle, stepId: "canceled", state: "reserved" },
		},
	];
	const gate = DispatchGate.create({
		directory: join(directory, "dispatch"),
		dataHomeId: crypto.randomUUID(),
		evidence: {
			readTerminal: async () => {
				throw new Error("unexpected_receipt");
			},
			withReconciliation: async () => {
				throw new Error("unexpected_reconciliation");
			},
		},
	});
	const database: NativeRuntimePort = {
		state: (async (operation, input) => {
			if (operation === "pending") return "afterId" in input && input.afterId === "" ? [f.row.executionId] : [];
			if (operation === "steps") return "afterStepId" in input && input.afterStepId === "" ? rows : [];
			return null;
		}) as NativeRuntimePort["state"],
		observe: async ({ stepId }) => {
			calls.push(`observe:${stepId}`);
		},
		recover: async ({ stepId }) => {
			calls.push(`recover:${stepId}`);
		},
		acknowledge: async () => {
			throw new Error("unexpected_acknowledgment");
		},
	};
	try {
		const connection = createNativeRuntimeConnection({
			database,
			gate,
			signal: new AbortController().signal,
			archive: {
				readAuthorityBytes: () => {
					throw new Error("unexpected_authority_read");
				},
				writeTerminal: (): TerminalReceipt => {
					throw new Error("unexpected_terminal");
				},
			},
			withEngine: async () => {
				throw new Error("unexpected_engine_call");
			},
			refreshExecution: async () => {
				calls.push("refresh");
			},
			log: () => undefined,
		});
		await connection.recover();
		expect(calls).toEqual([
			"recover:reserved",
			"observe:reserved",
			"refresh",
			"observe:unknown",
			"refresh",
			"observe:canceled",
			"refresh",
		]);
		expect(gate.read().permits).toHaveLength(0);
	} finally {
		await rm(directory, { recursive: true });
	}
});

test("startup settles a committed acknowledgment without native inspection or engine submission", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-native-runtime-unit-"));
	const f = completionFixture();
	let terminal: TerminalReceipt | null = null;
	const gate = DispatchGate.create({
		directory: join(directory, "dispatch"),
		dataHomeId: crypto.randomUUID(),
		evidence: {
			readTerminal: async () => {
				if (terminal === null) throw new Error("terminal_missing");
				return terminal;
			},
			withReconciliation: async () => {
				throw new Error("unexpected_reconciliation");
			},
		},
	});
	const permit = gate.acquire({
		effectId: `native-completion:${f.receipt.completionId}`,
		kind: "engine-delivery",
		executionId: f.row.executionId,
		attemptId: f.row.handle.attemptId,
		jobId: f.receipt.engineJobId,
		requestId: f.receipt.completionId,
		payloadDigest: f.receipt.resultDigest,
	});
	const database: NativeRuntimePort = {
		state: (async (operation) => (operation === "receipt" ? f.receipt : [])) as NativeRuntimePort["state"],
		observe: async () => {
			throw new Error("unexpected_observation");
		},
		recover: async () => {
			throw new Error("unexpected_launch");
		},
		acknowledge: async () => {
			throw new Error("unexpected_acknowledgment");
		},
	};
	try {
		const connection = createNativeRuntimeConnection({
			database,
			gate,
			signal: new AbortController().signal,
			archive: {
				readAuthorityBytes: () => {
					throw new Error("unexpected_authority_read");
				},
				writeTerminal: (input) => {
					expect(input.sourceBytes).toBe(JSON.stringify(f.receipt));
					terminal = { id: "saved-terminal", permit: input.permit, outcome: input.outcome };
					return terminal;
				},
			},
			withEngine: async () => {
				throw new Error("unexpected_engine_call");
			},
			refreshExecution: async () => undefined,
			log: () => undefined,
		});
		await connection.recover();
		expect(gate.read().permits.find((entry) => entry.permit.id === permit.id)?.terminal).toEqual(terminal);
	} finally {
		await rm(directory, { recursive: true });
	}
});
