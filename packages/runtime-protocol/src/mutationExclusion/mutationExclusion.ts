import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { flock } from "fs-ext";

export type RuntimeMutationScope = {
	kind: "workspace" | "provider" | "attempt-retention" | "attempt" | "repository";
	directory: string;
};

const order: Record<RuntimeMutationScope["kind"], number> = {
	workspace: 0,
	provider: 1,
	"attempt-retention": 2,
	attempt: 3,
	repository: 4,
};

const localOperations = new Map<string, Promise<void>>();

const normalized = (scope: RuntimeMutationScope) => ({ ...scope, directory: resolve(scope.directory) });

export const orderRuntimeMutationScopes = (scopes: RuntimeMutationScope[]) =>
	[...new Map(scopes.map(normalized).map((scope) => [`${scope.kind}:${scope.directory}`, scope])).values()].sort(
		(a, b) => order[a.kind] - order[b.kind] || a.directory.localeCompare(b.directory),
	);

export const runtimeMutationLockPath = (dataHome: string, scope: RuntimeMutationScope) => {
	const value = normalized(scope);
	const digest = createHash("sha256").update(`${value.kind}\0${value.directory}`).digest("hex");
	return join(dataHome, "runtime-mutation-locks", `${value.kind}-${digest}.lock`);
};

const acquire = async (dataHome: string, scope: RuntimeMutationScope, signal?: AbortSignal) => {
	signal?.throwIfAborted();
	const root = join(dataHome, "runtime-mutation-locks");
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const path = runtimeMutationLockPath(dataHome, scope);
	const previous = localOperations.get(path) ?? Promise.resolve();
	const held = Promise.withResolvers<void>();
	const current = previous.then(() => held.promise);
	localOperations.set(path, current);
	void current.then(() => {
		if (localOperations.get(path) === current) localOperations.delete(path);
	});
	let fd: number;
	try {
		await previous;
		signal?.throwIfAborted();
		fd = openSync(path, "a", 0o600);
	} catch (error) {
		held.resolve();
		throw error;
	}
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		closeSync(fd);
		held.resolve();
	};
	return new Promise<() => void>((resolveLock, rejectLock) => {
		const abort = () => {
			close();
			rejectLock(signal!.reason);
		};
		signal?.addEventListener("abort", abort, { once: true });
		flock(fd, "ex", (error) => {
			signal?.removeEventListener("abort", abort);
			if (closed) return;
			if (error) {
				close();
				rejectLock(error);
				return;
			}
			resolveLock(close);
		});
	});
};

export async function withRuntimeMutationExclusion<T>(
	dataHome: string,
	scopes: RuntimeMutationScope[],
	action: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	const releases: (() => void)[] = [];
	try {
		for (const scope of orderRuntimeMutationScopes(scopes)) releases.push(await acquire(dataHome, scope, signal));
		return await action();
	} finally {
		for (const release of releases.reverse()) release();
	}
}
