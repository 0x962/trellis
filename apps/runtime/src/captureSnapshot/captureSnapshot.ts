import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type {
	RuntimeCaptureBinding,
	RuntimeCaptureEntry,
	RuntimeCaptureProducer,
	RuntimeCaptureRequest,
	RuntimeCaptureSealReceipt,
} from "@trellis/runtime-protocol";
import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";
import { attemptProcesses } from "../attemptProcesses";
import { inspectSessionRecord } from "../inspectSessionRecord.ts";
import type { SessionRecord } from "../sessionRecord.ts";
import { captureError, sameCaptureValue } from "./captureError.ts";
import { buildCaptureRoots, captureRelativePath, inventoryCaptureRoot } from "./captureRoots.ts";
import { captureRepositoryIdentity, discoverCapture } from "./discoverCapture.ts";
import type { CaptureDiscovery } from "./types.ts";

export type CaptureSnapshotDependencies = {
	inspect: typeof inspectSessionRecord;
	processes: typeof attemptProcesses;
	records: () => SessionRecord[];
};

const assertNoRelatedWriter = async (
	runtimeHome: string,
	discovery: CaptureDiscovery,
	selected: SessionRecord[],
	related: SessionRecord[],
	dependencies: Pick<CaptureSnapshotDependencies, "inspect" | "processes">,
) => {
	const selectedIds = new Set(selected.map((record) => record.session.id));
	const workspaces = new Set(discovery.repositories.map((repository) => repository.workspace));
	const commonRoots = new Set(
		discovery.repositories.flatMap((repository) => (repository.common === null ? [] : [repository.common])),
	);
	const providerScopes = new Set(discovery.providerScopes);
	for (const record of related) {
		if (selectedIds.has(record.session.id)) continue;
		const status = dependencies.inspect(record).status;
		const hasProcesses = dependencies.processes(runtimeHome, record.session.id).length > 0;
		if (status === "exited" && !hasProcesses) continue;
		if (record.launch === null) {
			throw captureError(`Runtime session ${record.session.id} has no retained workspace identity`);
		}
		if (record.launch.capture === undefined)
			throw captureError(`Runtime session ${record.session.id} has no retained provider writer scope`);
		const workspace = await realpath(record.launch.cwd);
		const repository = await captureRepositoryIdentity(workspace, [record.session.id]);
		const overlapsWorkspace = workspaces.has(workspace) || (repository.common !== null && commonRoots.has(repository.common));
		const overlapsProvider = record.launch.capture.providerScopePaths.some((path) => providerScopes.has(resolve(path)));
		if (!overlapsWorkspace && !overlapsProvider) continue;
		if (status !== "exited") throw captureError(`Related attempt ${record.session.id} is ${status}`);
		throw captureError(`Related attempt ${record.session.id} still has provider processes`);
	}
};

export async function withCaptureSnapshot<T>(
	runtimeHome: string,
	request: RuntimeCaptureRequest,
	records: SessionRecord[],
	action: (producer: RuntimeCaptureProducer) => Promise<T>,
	signal?: AbortSignal,
	dependencies: Partial<CaptureSnapshotDependencies> = {},
): Promise<T> {
	const inspect = dependencies.inspect ?? inspectSessionRecord;
	const processes = dependencies.processes ?? attemptProcesses;
	const relatedRecords = dependencies.records ?? (() => records);
	const dataHome = dirname(runtimeHome);
	const before = await discoverCapture(request, records);
	const scopes = [
		...before.repositories.map((repository) => ({ kind: "workspace" as const, directory: repository.workspace })),
		...before.providerScopes.map((directory) => ({ kind: "provider" as const, directory })),
		{ kind: "attempt-retention" as const, directory: join(dataHome, "harness-attempts") },
		...before.identities.map((identity) => ({
			kind: "attempt" as const,
			directory: join(dataHome, "harness-attempts", identity.attemptId),
		})),
		...before.repositories.flatMap((repository) =>
			repository.common === null ? [] : [{ kind: "repository" as const, directory: repository.common }],
		),
	];
	return withRuntimeMutationExclusion(
		dataHome,
		scopes,
		async () => {
			const held = await discoverCapture(request, records, true);
			if (!sameCaptureValue(before, held)) throw captureError("Capture sources changed before exclusion completed");
			await assertNoRelatedWriter(runtimeHome, held, records, relatedRecords(), { inspect, processes });
			for (const record of records) {
				const status = inspect(record).status;
				if (status !== "exited") throw captureError(`Attempt ${record.session.id} is ${status}`);
				if (processes(runtimeHome, record.session.id).length > 0)
					throw captureError(`Attempt ${record.session.id} still has provider processes`);
			}
			const { states, workspaces } = buildCaptureRoots(held);
			const binding: RuntimeCaptureBinding = {
				...request,
				identities: held.identities,
				workspaces,
				roots: states.map((state) => state.root),
			};
			let active = true;
			let inventory: Awaited<ReturnType<RuntimeCaptureProducer["inventory"]>> | undefined;
			const assertBinding = (value: RuntimeCaptureBinding) => {
				if (!active || !sameCaptureValue(value, binding)) throw captureError("Capture binding is not active");
			};
			const producer: RuntimeCaptureProducer = {
				binding,
				inventory: async (value, operationSignal) => {
					operationSignal?.throwIfAborted();
					assertBinding(value);
					if (inventory === undefined) {
						const entries: RuntimeCaptureEntry[] = [];
						for (const state of states) entries.push(...(await inventoryCaptureRoot(state, operationSignal)));
						inventory = { binding, entries, unavailable: held.unavailable };
					}
					return inventory;
				},
				read: async function* (input, operationSignal) {
					operationSignal?.throwIfAborted();
					assertBinding(input.binding);
					const state = states.find((item) => item.root.rootId === input.rootId);
					const entry = inventory?.entries.find(
						(item) => item.rootId === input.rootId && item.path === input.path,
					);
					if (state === undefined || entry?.kind !== "file") throw captureError("Capture file is not in the inventory");
					const path = captureRelativePath(input.path);
					const hash = createHash("sha256");
					let size = 0;
					for await (const chunk of createReadStream(join(state.directory, path))) {
						operationSignal?.throwIfAborted();
						const bytes = Buffer.from(chunk);
						hash.update(bytes);
						size += bytes.length;
						yield bytes;
					}
					if (size !== entry.size || hash.digest("hex") !== entry.sha256)
						throw captureError("Capture file changed after inventory");
				},
				seal: async (input, operationSignal) => {
					operationSignal?.throwIfAborted();
					assertBinding(input.binding);
					if (!states.some((state) => state.root.rootId === input.rootId))
						throw captureError("Capture seal root is not in the binding");
					if (!/^[a-f0-9]{64}$/.test(input.manifestSha256))
						throw captureError("Capture seal needs a SHA256 digest");
					const receipt: RuntimeCaptureSealReceipt = {
						schemaVersion: 1,
						kind: "trellis-runtime-capture-seal",
						...input,
					};
					return Buffer.from(JSON.stringify(receipt));
				},
			};
			try {
				return await action(producer);
			} finally {
				active = false;
			}
		},
		signal,
	);
}
