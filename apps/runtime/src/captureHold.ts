import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	RuntimeCaptureFinalizeInput,
	RuntimeCaptureFinalization,
	RuntimeCaptureFinalizationReceipt,
	RuntimeCaptureRequest,
} from "@trellis/runtime-protocol";
import {
	orderRuntimeMutationScopes,
	readRuntimeCaptureHold,
	removeRuntimeCaptureHold,
	type RuntimeCaptureHold,
	type RuntimeMutationScope,
	withRuntimeMutationExclusion,
	writeRuntimeCaptureHold,
} from "@trellis/runtime-protocol/mutation-exclusion";

export const runtimeCaptureRequestSha256 = (request: RuntimeCaptureRequest) =>
	createHash("sha256").update(JSON.stringify(request)).digest("hex");

export const retainRuntimeCaptureHold = (
	dataHome: string,
	request: RuntimeCaptureRequest,
	scopes: RuntimeMutationScope[],
	global: boolean,
): RuntimeCaptureHold => {
	if (readFinalization(dataHome, request.captureId) !== undefined)
		throw Object.assign(new Error(`Capture ${request.captureId} is already finalized`), {
			code: "CAPTURE_CONFLICT",
		});
	const hold: RuntimeCaptureHold = {
		schemaVersion: 1,
		captureId: request.captureId,
		requestSha256: runtimeCaptureRequestSha256(request),
		global,
		attemptIds: request.identities.map((identity) => identity.attemptId).sort(),
		scopes: orderRuntimeMutationScopes(scopes),
		overlapScopes: orderRuntimeMutationScopes(scopes).filter((scope) => scope.kind !== "attempt-retention"),
		createdAt: new Date().toISOString(),
	};
	writeRuntimeCaptureHold(dataHome, hold);
	return hold;
};

export const runtimeCaptureFinalizationReceipt = (
	input: RuntimeCaptureFinalizeInput,
): RuntimeCaptureFinalizationReceipt => ({
	schemaVersion: 1,
	kind: "trellis-runtime-capture-finalization",
	request: input.request,
	requestSha256: runtimeCaptureRequestSha256(input.request),
	outcome: input.outcome,
	finalizedAt: new Date().toISOString(),
});

const finalizationPath = (dataHome: string, captureId: string) =>
	join(
		dataHome,
		"runtime-capture-finalizations",
		`${createHash("sha256").update(captureId).digest("hex")}.json`,
	);

function readFinalization(dataHome: string, captureId: string): RuntimeCaptureFinalization | undefined {
	const path = finalizationPath(dataHome, captureId);
	if (!existsSync(path)) return;
	const bytes = readFileSync(path);
	return {
		receipt: JSON.parse(bytes.toString()) as RuntimeCaptureFinalizationReceipt,
		receiptBytes: bytes.toString(),
	};
}

export const completeRuntimeCaptureHold = (
	dataHome: string,
	input: RuntimeCaptureFinalizeInput,
): RuntimeCaptureFinalization => {
	const requestSha256 = runtimeCaptureRequestSha256(input.request);
	const previous = readFinalization(dataHome, input.request.captureId);
	if (previous !== undefined) {
		if (previous.receipt.requestSha256 !== requestSha256 || previous.receipt.outcome !== input.outcome)
			throw Object.assign(new Error(`Capture ${input.request.captureId} has a different finalization`), {
				code: "CAPTURE_CONFLICT",
			});
		if (readRuntimeCaptureHold(dataHome, input.request.captureId) !== undefined)
			removeRuntimeCaptureHold(dataHome, input.request.captureId);
		return previous;
	}
	const hold = readRuntimeCaptureHold(dataHome, input.request.captureId);
	if (hold === undefined || hold.requestSha256 !== requestSha256)
		throw Object.assign(new Error(`Capture ${input.request.captureId} has no matching durable hold`), {
			code: "CAPTURE_UNAVAILABLE",
		});
	const receipt = runtimeCaptureFinalizationReceipt(input);
	const receiptBytes = Buffer.from(JSON.stringify(receipt));
	const directory = join(dataHome, "runtime-capture-finalizations");
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	writeFileSync(finalizationPath(dataHome, input.request.captureId), receiptBytes, {
		flag: "wx",
		mode: 0o600,
		flush: true,
	});
	removeRuntimeCaptureHold(dataHome, input.request.captureId);
	return { receipt, receiptBytes: receiptBytes.toString() };
};

export const finalizeRuntimeCaptureHold = async (
	dataHome: string,
	input: RuntimeCaptureFinalizeInput,
): Promise<RuntimeCaptureFinalization> => {
	const previous = readFinalization(dataHome, input.request.captureId);
	const hold = readRuntimeCaptureHold(dataHome, input.request.captureId);
	if (
		previous === undefined &&
		(hold === undefined || hold.requestSha256 !== runtimeCaptureRequestSha256(input.request))
	)
		throw Object.assign(new Error(`Capture ${input.request.captureId} has no matching durable hold`), {
			code: "CAPTURE_UNAVAILABLE",
		});
	if (hold === undefined) return completeRuntimeCaptureHold(dataHome, input);
	return withRuntimeMutationExclusion(
		dataHome,
		hold.scopes,
		async () => {
			return completeRuntimeCaptureHold(dataHome, input);
		},
		undefined,
		{ captureId: hold.captureId, exclusiveAdmission: hold.global },
	);
};
