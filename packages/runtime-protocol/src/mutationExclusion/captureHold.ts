import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RuntimeMutationScope } from "./mutationExclusion.ts";

export type RuntimeCaptureHold = {
	schemaVersion: 1;
	captureId: string;
	requestSha256: string;
	global: boolean;
	attemptIds: string[];
	scopes: RuntimeMutationScope[];
	createdAt: string;
};

const directory = (dataHome: string) => join(dataHome, "runtime-capture-holds");
const path = (dataHome: string, captureId: string) =>
	join(directory(dataHome), `${createHash("sha256").update(captureId).digest("hex")}.json`);
const key = (scope: RuntimeMutationScope) => `${scope.kind}:${resolve(scope.directory)}`;

export const readRuntimeCaptureHolds = (dataHome: string): RuntimeCaptureHold[] => {
	const root = directory(dataHome);
	if (!existsSync(root)) return [];
	return readdirSync(root)
		.filter((file) => file.endsWith(".json"))
		.sort()
		.map((file) => JSON.parse(readFileSync(join(root, file), "utf8")) as RuntimeCaptureHold);
};

export const writeRuntimeCaptureHold = (dataHome: string, hold: RuntimeCaptureHold) => {
	mkdirSync(directory(dataHome), { recursive: true, mode: 0o700 });
	writeFileSync(path(dataHome, hold.captureId), JSON.stringify(hold), { flag: "wx", mode: 0o600, flush: true });
};

export const removeRuntimeCaptureHold = (dataHome: string, captureId: string) => {
	rmSync(path(dataHome, captureId));
};

export const readRuntimeCaptureHold = (dataHome: string, captureId: string) =>
	readRuntimeCaptureHolds(dataHome).find((hold) => hold.captureId === captureId);

export const runtimeCaptureHoldOverlaps = (hold: RuntimeCaptureHold, scopes: RuntimeMutationScope[]) => {
	if (hold.global) return true;
	const held = new Set(hold.scopes.map(key));
	return scopes.some((scope) => held.has(key(scope)));
};

export const assertNoRuntimeCaptureHold = (
	dataHome: string,
	scopes: RuntimeMutationScope[],
	allowedCaptureId?: string,
	unprovenWriter = false,
) => {
	for (const hold of readRuntimeCaptureHolds(dataHome)) {
		if (hold.captureId === allowedCaptureId || (!unprovenWriter && !runtimeCaptureHoldOverlaps(hold, scopes)))
			continue;
		throw Object.assign(new Error(`Capture ${hold.captureId} holds this runtime writer scope`), {
			code: "CAPTURE_HELD",
		});
	}
};
