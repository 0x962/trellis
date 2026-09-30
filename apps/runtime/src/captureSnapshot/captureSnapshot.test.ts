import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeCaptureProducer } from "@trellis/runtime-protocol";
import {
	readRuntimeCaptureHold,
	readRuntimeCaptureHolds,
	withRuntimeMutationExclusion,
} from "@trellis/runtime-protocol/mutation-exclusion";
import { finalizeRuntimeCaptureHold } from "../captureHold.ts";
import { type CaptureSnapshotDependencies, withCaptureSnapshot } from "./captureSnapshot.ts";
import {
	captureBytes as bytes,
	captureDependencies as dependencies,
	captureIdentity as identity,
	captureRecord as record,
	captureRequest as request,
	git,
	launchIdentity as createLaunchIdentity,
	repository as createRepository,
} from "./fixture.ts";

let home: string;

beforeEach(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-capture-"));
	await mkdir(join(home, "runtime"));
});

afterEach(async () => rm(home, { recursive: true, force: true }));

const repository = (name: string) => createRepository(home, name);
const launchIdentity = (attemptId: string, workspace: string) => createLaunchIdentity(home, attemptId, workspace);

test("binds a standalone repository and reads only inventory files", async () => {
	const workspace = await repository("standalone");
	const launch = await launchIdentity("1", workspace);
	let retained: RuntimeCaptureProducer | undefined;
	await withCaptureSnapshot(
		join(home, "runtime"),
		request([launch]),
		[record(workspace, launch)],
		async (producer) => {
			retained = producer;
			const association = producer.binding.workspaces[0]!;
			expect(association.gitRootId).toBe(association.commonRootId);
			const gitRoot = producer.binding.roots.find((root) => root.rootId === association.gitRootId)!;
			expect(["git", "common"]).toContain(gitRoot.kind);
			const inventory = await producer.inventory(producer.binding);
			const conversation = producer.binding.roots.find((root) => root.kind === "conversation")!;
			expect(
				inventory.entries.some(
					(entry) =>
						entry.rootId === conversation.rootId &&
						entry.path === "empty" &&
						entry.kind === "directory" &&
						typeof entry.mode === "number",
				),
			).toBe(true);
			expect(inventory.entries.some((entry) => entry.path === ".git")).toBe(false);
			expect(
				await bytes(producer.read({ binding: producer.binding, rootId: conversation.rootId, path: "session.jsonl" })),
			).toBe("1\n");
			const receipt = JSON.parse(
				Buffer.from(
					await producer.seal({ binding: producer.binding, rootId: association.worktreeRootId, manifestSha256: "a".repeat(64) }),
				).toString(),
			);
			expect(receipt).toEqual({
				schemaVersion: 1,
				kind: "trellis-runtime-capture-seal",
				binding: producer.binding,
				rootId: association.worktreeRootId,
				manifestSha256: "a".repeat(64),
			});
		},
		undefined,
		dependencies,
	);
	expect(retained).toBeDefined();
	await expect(retained!.inventory(retained!.binding)).rejects.toMatchObject({ code: "CAPTURE_UNAVAILABLE" });
});

test("binds a workspace without Git metadata", async () => {
	const workspace = join(home, "plain-workspace");
	await mkdir(workspace);
	await writeFile(join(workspace, "notes.txt"), "notes\n");
	const launch = await launchIdentity("9", workspace);
	await withCaptureSnapshot(
		join(home, "runtime"),
		request([launch]),
		[record(workspace, launch)],
		async (producer) => {
			const association = producer.binding.workspaces[0]!;
			expect(association.gitRootId).toBeNull();
			expect(association.commonRootId).toBeNull();
			const inventory = await producer.inventory(producer.binding);
			expect(
				inventory.entries.some(
					(entry) =>
						entry.rootId === association.worktreeRootId &&
						entry.path === "notes.txt" &&
						entry.kind === "file" &&
						typeof entry.mode === "number" &&
						entry.size === 6 &&
						entry.sha256 === createHash("sha256").update("notes\n").digest("hex"),
				),
			).toBe(true);
		},
		undefined,
		dependencies,
	);
});

test("holds all mutation scopes through the final seal", async () => {
	const workspace = await repository("held");
	const launch = await launchIdentity("2", workspace);
	const entered: string[] = [];
	const writers: Promise<void>[] = [];
	await withCaptureSnapshot(
		join(home, "runtime"),
		request([launch]),
		[record(workspace, launch)],
		async (producer) => {
			const association = producer.binding.workspaces[0]!;
			const common = producer.binding.roots.find((root) => root.rootId === association.commonRootId)!;
			const scopes = [
				{ kind: "workspace" as const, directory: workspace },
				{ kind: "provider" as const, directory: launch.providerRoots[0]!.path },
				{ kind: "attempt-retention" as const, directory: join(home, "harness-attempts") },
				{ kind: "attempt" as const, directory: join(home, "harness-attempts", launch.attemptId) },
				{ kind: "repository" as const, directory: common.originalIdentity },
			];
			for (const scope of scopes)
				writers.push(
					withRuntimeMutationExclusion(home, [scope], async () => {
						entered.push(scope.kind);
					}),
				);
			await Promise.resolve();
			expect(entered).toEqual([]);
			await producer.seal({ binding: producer.binding, rootId: association.worktreeRootId, manifestSha256: "b".repeat(64) });
			expect(entered).toEqual([]);
		},
		undefined,
		dependencies,
	);
	await Promise.all(writers);
	expect(entered.sort()).toEqual(["attempt", "attempt-retention", "provider", "repository", "workspace"]);
});

test("deduplicates a common Git root across linked worktrees", async () => {
	const source = await repository("source");
	const linked = join(home, "linked");
	await git(source, "worktree", "add", "-b", "linked", linked);
	const first = await launchIdentity("3", source);
	const second = await launchIdentity("4", linked);
	await withCaptureSnapshot(
		join(home, "runtime"),
		request([first, second]),
		[record(source, first), record(linked, second)],
		async (producer) => {
			expect(producer.binding.workspaces).toHaveLength(2);
			expect(producer.binding.workspaces[0]!.commonRootId).toBe(producer.binding.workspaces[1]!.commonRootId);
		},
		undefined,
		dependencies,
	);
});

test("refuses an active attempt in another worktree with the same common Git root", async () => {
	const source = await repository("shared-source");
	const linked = join(home, "shared-linked");
	await git(source, "worktree", "add", "-b", "shared-linked", linked);
	const selected = await launchIdentity("10", source);
	const other = await launchIdentity("11", linked);
	const otherRecord = record(linked, other);
	await expect(
		withCaptureSnapshot(
			join(home, "runtime"),
			request([selected]),
			[record(source, selected)],
			async () => undefined,
			undefined,
			{
				...dependencies,
				records: () => [otherRecord],
				inspect: (value) =>
					({ status: value.session.id === other.attemptId ? "running" : "exited" }) as ReturnType<
						CaptureSnapshotDependencies["inspect"]
					>,
			},
		),
	).rejects.toThrow("Related attempt 11 is running");
});

test("refuses an active attempt that shares a retained provider scope", async () => {
	const selectedWorkspace = await repository("provider-selected");
	const otherWorkspace = await repository("provider-other");
	const selected = await launchIdentity("12", selectedWorkspace);
	const other = await launchIdentity("13", otherWorkspace);
	other.providerScopePaths = selected.providerScopePaths;
	other.providerRoots = selected.providerRoots;
	const otherRecord = record(otherWorkspace, other);
	await expect(
		withCaptureSnapshot(
			join(home, "runtime"),
			request([selected]),
			[record(selectedWorkspace, selected)],
			async () => undefined,
			undefined,
			{
				...dependencies,
				records: () => [otherRecord],
				inspect: (value) =>
					({ status: value.session.id === other.attemptId ? "running" : "exited" }) as ReturnType<
						CaptureSnapshotDependencies["inspect"]
					>,
			},
		),
	).rejects.toThrow("Related attempt 13 is running");
});

test("refuses an active descendant and releases an acquired scope after failure", async () => {
	const workspace = await repository("active");
	const launch = await launchIdentity("5", workspace);
	await expect(
		withCaptureSnapshot(
			join(home, "runtime"),
			request([launch]),
			[record(workspace, launch)],
			async () => undefined,
			undefined,
			{ ...dependencies, processes: () => [{ pid: 88 }] as ReturnType<CaptureSnapshotDependencies["processes"]> },
		),
	).rejects.toThrow("still has provider processes");
	let entered = false;
	await withRuntimeMutationExclusion(home, [{ kind: "workspace", directory: workspace }], async () => {
		entered = true;
	});
	expect(entered).toBe(true);
});

test("refuses an attempt that becomes active before the held read", async () => {
	const workspace = await repository("running");
	const launch = await launchIdentity("7", workspace);
	await expect(
		withCaptureSnapshot(
			join(home, "runtime"),
			request([launch]),
			[record(workspace, launch)],
			async () => undefined,
			undefined,
			{ ...dependencies, inspect: () => ({ status: "running" }) as ReturnType<CaptureSnapshotDependencies["inspect"]> },
		),
	).rejects.toThrow("Attempt 7 is running");
});

test("reports each missing conversation root with its original identity", async () => {
	const workspace = await repository("missing-provider");
	const launch = await launchIdentity("8", workspace);
	await rm(launch.providerRoots[0]!.path, { recursive: true });
	await withCaptureSnapshot(
		join(home, "runtime"),
		request([launch]),
		[record(workspace, launch)],
		async (producer) => {
			const inventory = await producer.inventory(producer.binding);
			expect(inventory.unavailable).toEqual([
				{
					identity: { ...identity(launch), providerSessionId: "session-8" },
					sourceKind: "account-profile",
					originalIdentity: launch.providerRoots[0]!.path,
					code: "provider_root_missing",
					message: "The retained conversation root does not exist.",
				},
			]);
		},
		undefined,
		dependencies,
	);
});

test("refuses a conversation root without its exact writer scope", async () => {
	const workspace = await repository("unscoped");
	const launch = await launchIdentity("6", workspace);
	launch.providerScopePaths = launch.providerScopePaths.slice(0, 1);
	await expect(
		withCaptureSnapshot(
			join(home, "runtime"),
			request([launch]),
			[record(workspace, launch)],
			async () => undefined,
			undefined,
			dependencies,
		),
	).rejects.toThrow("does not exclude its conversation root");
});

test("an empty capture returns an exact empty binding under a global hold", async () => {
	const input = request([]);
	let writerEntered = false;
	let writer: Promise<void> | undefined;
	const result = await withCaptureSnapshot(
		join(home, "runtime"),
		input,
		[],
		async (producer) => {
			expect(producer.binding.identities).toEqual([]);
			expect(producer.binding.workspaces).toEqual([]);
			expect(producer.binding.roots).toEqual([]);
			expect(await producer.inventory(producer.binding)).toEqual({
				binding: producer.binding,
				entries: [],
				unavailable: [],
			});
			writer = withRuntimeMutationExclusion(
				home,
				[{ kind: "provider", directory: join(home, "profiles", "future") }],
				async () => {
					writerEntered = true;
				},
			);
			await Promise.resolve();
			expect(writerEntered).toBe(false);
		},
		undefined,
		dependencies,
	);
	await writer;
	expect(writerEntered).toBe(true);
	expect(result.finalization.receipt.request).toEqual(input);
	expect(result.finalization.receipt.outcome).toBe("committed");
	expect(readRuntimeCaptureHold(home, input.captureId)).toBeUndefined();
	const recovered = await finalizeRuntimeCaptureHold(home, { request: input, outcome: "committed" });
	expect(recovered.receiptBytes).toBe(result.finalization.receiptBytes);
});

test("a failure after the last root seal retains the durable hold", async () => {
	const workspace = await repository("lost-after-seal");
	const launch = await launchIdentity("14", workspace);
	const input = request([launch]);
	await expect(
		withCaptureSnapshot(
			join(home, "runtime"),
			input,
			[record(workspace, launch)],
			async (producer) => {
				await producer.seal({
					binding: producer.binding,
					rootId: producer.binding.workspaces[0]!.worktreeRootId,
					manifestSha256: "c".repeat(64),
				});
				throw new Error("Capture channel closed");
			},
			undefined,
			dependencies,
		),
	).rejects.toThrow("Capture channel closed");
	expect(readRuntimeCaptureHold(home, input.captureId)?.requestSha256).toBeDefined();
	const finalization = await finalizeRuntimeCaptureHold(home, { request: input, outcome: "abandoned" });
	expect(finalization.receipt.outcome).toBe("abandoned");
	expect(readRuntimeCaptureHold(home, input.captureId)).toBeUndefined();
});

test("two lost capture requests leave only the acquired hold for recovery", async () => {
	const firstRequest = { ...request([]), captureId: "capture-a" };
	const secondRequest = { ...request([]), captureId: "capture-b" };
	const firstController = new AbortController();
	const secondController = new AbortController();
	const firstEntered = Promise.withResolvers<void>();
	let secondEntered = false;
	const first = withCaptureSnapshot(
		join(home, "runtime"),
		firstRequest,
		[],
		async (producer) => {
			firstEntered.resolve();
			await new Promise<void>((resolve) => producer.signal.addEventListener("abort", () => resolve(), { once: true }));
			throw producer.signal.reason;
		},
		firstController.signal,
		dependencies,
	);
	await firstEntered.promise;
	const second = withCaptureSnapshot(
		join(home, "runtime"),
		secondRequest,
		[],
		async () => {
			secondEntered = true;
		},
		secondController.signal,
		dependencies,
	);
	const firstFailure = expect(first).rejects.toThrow("first channel lost");
	const secondFailure = expect(second).rejects.toThrow("second channel lost");
	await Promise.resolve();
	expect(readRuntimeCaptureHolds(home).map((hold) => hold.captureId)).toEqual(["capture-a"]);
	secondController.abort(new Error("second channel lost"));
	firstController.abort(new Error("first channel lost"));
	await Promise.all([firstFailure, secondFailure]);
	expect(secondEntered).toBe(false);
	expect(readRuntimeCaptureHolds(home).map((hold) => hold.captureId)).toEqual(["capture-a"]);
	const recovered = await finalizeRuntimeCaptureHold(home, { request: firstRequest, outcome: "abandoned" });
	expect(recovered.receipt.outcome).toBe("abandoned");
	expect(readRuntimeCaptureHolds(home)).toEqual([]);
});
