import { lstat, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	type HostTransferClassification,
	type HostTransferDestination,
	type HostTransferEndpoint,
	type HostTransferManifest,
	HostTransferManifestSchema,
	type HostTransferObject,
	HostTransferObjectSchema,
	type ProviderResumeCompatibility,
} from "@trellis/api";
import { appendScannedObjects } from "./components/appendScannedObjects/index.ts";
import { checksum } from "./components/checksum/index.ts";
import { destinationForPath } from "./components/destinationForPath/index.ts";
import { type GitReader, readGitState } from "./components/readGitState/index.ts";

type PlannedDestination = HostTransferDestination;

type RepositoryInput = {
	id: string;
	path: string;
	destination: PlannedDestination;
	secret: boolean;
};

type WorktreeInput = RepositoryInput & { repositoryId: string };

type AccountProfileInput = {
	id: string;
	provider: string;
	path: string;
};

type TranscriptInput = {
	id: string;
	assignmentId: string;
	provider: string;
	path: string;
	classification: HostTransferClassification;
	destination: PlannedDestination;
	secret: boolean;
};

type AbsolutePathInput = {
	id: string;
	field: string;
	path: string;
	classification: HostTransferClassification;
	destination: PlannedDestination;
	secret: boolean;
};

export type HostTransferInventoryInput = {
	source: HostTransferEndpoint;
	destination: HostTransferEndpoint;
	repositories: RepositoryInput[];
	worktrees: WorktreeInput[];
	accountProfiles: AccountProfileInput[];
	transcripts: TranscriptInput[];
	absolutePaths: AbsolutePathInput[];
	providerResumeCompatibility: ProviderResumeCompatibility[];
};

type InventoryDependencies = {
	git: GitReader;
	now: () => Date;
};

const isMissing = (path: string) =>
	lstat(path).then(
		() => false,
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return true;
			throw error;
		},
	);

export const inventoryHostTransfer = async (
	input: HostTransferInventoryInput,
	dependencies: Partial<InventoryDependencies> = {},
): Promise<HostTransferManifest> => {
	const objects: HostTransferObject[] = [];
	const symlinkSources = new Set<string>();
	const plannedInputs = [...input.repositories, ...input.worktrees, ...input.transcripts, ...input.absolutePaths].map(
		(entry) => ({ source: resolve(entry.path), destination: entry.destination }),
	);
	const mappings = [
		{
			source: resolve(input.source.dataHome),
			destination: { state: "mapped" as const, path: input.destination.dataHome },
		},
		{
			source: resolve(input.source.homeDirectory),
			destination: { state: "mapped" as const, path: input.destination.homeDirectory },
		},
		...plannedInputs,
		...input.accountProfiles.map((account) => ({
			source: resolve(account.path),
			destination: {
				state: "excluded" as const,
				reason: `Sign in to ${account.provider} on the destination host.`,
			},
		})),
	];
	const database = { id: "data:database", kind: "database" as const, name: "db" };
	await appendScannedObjects(
		objects,
		{
			id: database.id,
			kind: database.kind,
			sourcePath: join(input.source.dataHome, database.name),
			classification: "portable",
			secret: true,
			destination: { state: "mapped", path: join(input.destination.dataHome, database.name) },
		},
		mappings,
		symlinkSources,
	);

	const optionalRoots = [
		{ id: "data:attachments", kind: "attachments", name: "attachments" },
		{ id: "data:pages", kind: "pages", name: "pages" },
	] as const;
	for (const root of optionalRoots) {
		const sourcePath = join(input.source.dataHome, root.name);
		if (await isMissing(sourcePath)) {
			const absent = `absent\0${root.kind}\0${sourcePath}`;
			objects.push(
				HostTransferObjectSchema.parse({
					id: root.id,
					kind: root.kind,
					sourcePath,
					classification: "unsupported",
					bytes: 0,
					sha256: checksum(absent),
					secret: true,
					destination: {
						state: "excluded",
						reason: `The source host has no ${root.name} directory.`,
					},
				}),
			);
			continue;
		}
		await appendScannedObjects(
			objects,
			{
				id: root.id,
				kind: root.kind,
				sourcePath,
				classification: "portable",
				secret: true,
				destination: { state: "mapped", path: join(input.destination.dataHome, root.name) },
			},
			mappings,
			symlinkSources,
		);
	}

	const gitInputs = [
		...input.repositories.map((entry) => ({ ...entry, kind: "repository" as const })),
		...input.worktrees.map((entry) => ({ ...entry, kind: "worktree" as const })),
	].sort((left, right) => left.id.localeCompare(right.id));
	const gitStates = new Map<string, Awaited<ReturnType<typeof readGitState>>>();
	const commonDirectories = new Map<string, { id: string; checkoutIds: string[] }>();
	for (const entry of gitInputs) {
		const state = await readGitState(entry.path, dependencies.git);
		const commonDirectory = await realpath(state.commonDirectory);
		gitStates.set(entry.id, { ...state, commonDirectory });
		const common = commonDirectories.get(commonDirectory);
		if (common) common.checkoutIds.push(entry.id);
		else
			commonDirectories.set(commonDirectory, {
				id: `git-common:${checksum(commonDirectory).slice(0, 24)}`,
				checkoutIds: [entry.id],
			});
	}
	for (const [sourcePath, common] of [...commonDirectories].sort(([left], [right]) => left.localeCompare(right))) {
		const destination = destinationForPath(sourcePath, mappings);
		await appendScannedObjects(
			objects,
			{
				id: common.id,
				kind: "git-common-directory",
				sourcePath,
				classification: destination?.state === "mapped" ? "remappable" : "unsupported",
				secret: true,
				destination:
					destination === null
						? { state: "excluded", reason: "The Git common directory has no destination mapping." }
						: destination,
				checkoutIds: common.checkoutIds.sort(),
			},
			mappings,
			symlinkSources,
		);
	}
	for (const entry of gitInputs) {
		const state = gitStates.get(entry.id)!;
		const common = commonDirectories.get(state.commonDirectory)!;
		await appendScannedObjects(
			objects,
			{
				id: entry.id,
				kind: entry.kind,
				sourcePath: entry.path,
				classification: entry.destination.state === "mapped" ? "remappable" : "unsupported",
				secret: entry.secret,
				destination: entry.destination,
				...(entry.kind === "worktree" ? { repositoryId: entry.repositoryId } : {}),
				gitCommonDirectoryId: common.id,
				dirtyPaths: state.dirtyPaths,
			},
			mappings,
			symlinkSources,
			new Set([".git"]),
		);
	}

	for (const account of [...input.accountProfiles].sort((left, right) => left.id.localeCompare(right.id)))
		await appendScannedObjects(
			objects,
			{
				id: `account:${account.id}`,
				kind: "account-profile",
				accountId: account.id,
				provider: account.provider,
				sourcePath: account.path,
				classification: "reauthenticated",
				secret: true,
				destination: {
					state: "excluded",
					reason: `Sign in to ${account.provider} on the destination host.`,
				},
			},
			mappings,
			symlinkSources,
		);
	for (const transcript of [...input.transcripts].sort((left, right) => left.id.localeCompare(right.id)))
		await appendScannedObjects(
			objects,
			{
				id: transcript.id,
				kind: "transcript",
				assignmentId: transcript.assignmentId,
				provider: transcript.provider,
				sourcePath: transcript.path,
				classification: transcript.classification,
				secret: transcript.secret,
				destination: transcript.destination,
			},
			mappings,
			symlinkSources,
		);
	for (const absolutePathEntry of [...input.absolutePaths].sort((left, right) => left.id.localeCompare(right.id))) {
		const value = `${absolutePathEntry.field}\0${absolutePathEntry.path}`;
		objects.push(
			HostTransferObjectSchema.parse({
				id: absolutePathEntry.id,
				kind: "absolute-path",
				field: absolutePathEntry.field,
				sourcePath: absolutePathEntry.path,
				classification: absolutePathEntry.classification,
				bytes: Buffer.byteLength(value),
				sha256: checksum(value),
				secret: absolutePathEntry.secret,
				destination: absolutePathEntry.destination,
			}),
		);
	}

	const providerResumeCompatibility = [...input.providerResumeCompatibility].sort((left, right) =>
		left.assignmentId.localeCompare(right.assignmentId),
	);
	return HostTransferManifestSchema.parse({
		version: 1,
		createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
		source: input.source,
		destination: input.destination,
		objects,
		providerResumeCompatibility,
		totals: {
			objectCount: objects.length,
			bytes: objects.reduce((total, object) => total + object.bytes, 0),
			secretObjectCount: objects.filter((object) => object.secret).length,
			excludedObjectCount: objects.filter((object) => object.destination.state === "excluded").length,
		},
	});
};
