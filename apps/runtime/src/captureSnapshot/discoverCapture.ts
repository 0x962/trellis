import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type {
	RuntimeCaptureIdentity,
	RuntimeCaptureRequest,
	RuntimeCaptureUnavailable,
	RuntimeLaunchCaptureIdentity,
} from "@trellis/runtime-protocol";
import type { SessionRecord } from "../sessionRecord.ts";
import { captureError } from "./captureError.ts";
import type { CaptureDiscovery, CaptureRepository } from "./types.ts";

const exec = promisify(execFile);
const unique = (values: string[]) => [...new Set(values)].sort();
const sourceKind = (harness: string): "account-profile" | "opencode-export" =>
	harness === "opencode" ? "opencode-export" : "account-profile";

const gitPath = async (workspace: string, argument: "--absolute-git-dir" | "--git-common-dir") => {
	const result = await exec("git", ["-C", workspace, "rev-parse", "--path-format=absolute", argument]);
	return realpath(result.stdout.trim());
};

export const captureRepositoryIdentity = async (
	workspace: string,
	attemptIds: string[],
): Promise<CaptureRepository> => {
	const insideWorktree = await exec("git", ["-C", workspace, "rev-parse", "--is-inside-work-tree"]).then(
		(result) => result.stdout.trim(),
		(error: unknown) => {
			if ((error as { code?: number }).code === 128 && !existsSync(join(workspace, ".git"))) return "false";
			throw error;
		},
	);
	if (insideWorktree === "false")
		return { workspace, attemptIds: [...attemptIds].sort(), git: null, common: null, objectFormat: null };
	if (insideWorktree !== "true") throw captureError(`Capture does not support the Git workspace at ${workspace}`);
	const gitLinks = await exec("git", ["-C", workspace, "ls-files", "--stage"]);
	if (existsSync(join(workspace, ".gitmodules")) || gitLinks.stdout.split("\n").some((line) => line.startsWith("160000 ")))
		throw captureError("Capture does not support worktrees with submodules");
	const [git, common, format] = await Promise.all([
		gitPath(workspace, "--absolute-git-dir"),
		gitPath(workspace, "--git-common-dir"),
		exec("git", ["-C", workspace, "rev-parse", "--show-object-format"]),
	]);
	const objectFormat = format.stdout.trim();
	if (objectFormat !== "sha1" && objectFormat !== "sha256")
		throw captureError(`Capture does not support Git object format ${objectFormat}`);
	return { workspace, attemptIds: [...attemptIds].sort(), git, common, objectFormat };
};

const validateGitStore = async (repository: CaptureRepository) => {
	if (repository.common === null) return;
	if (process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES)
		throw captureError("Capture does not support external Git object directories");
	if (existsSync(join(repository.common, "objects", "info", "alternates")))
		throw captureError("Capture does not support a Git alternates file");
	const partialClone = await exec("git", [
		"-C",
		repository.workspace,
		"config",
		"--get-regexp",
		"^(extensions\\.partialClone|remote\\..*\\.promisor)$",
	]).then(
		() => true,
		(error: unknown) => {
			if ((error as { code?: number }).code === 1) return false;
			throw error;
		},
	);
	if (partialClone) throw captureError("Capture does not support a partial Git object store");
	const packs = join(repository.common, "objects", "pack");
	if (existsSync(packs) && (await readdir(packs)).some((name) => name.endsWith(".promisor")))
		throw captureError("Capture does not support a partial Git object store");
	await exec("git", ["-C", repository.workspace, "fsck", "--full", "--no-dangling"]);
};

const matchLaunch = (identity: RuntimeCaptureIdentity, launch: RuntimeLaunchCaptureIdentity) =>
	identity.harness === launch.harness &&
	identity.accountId === launch.accountId &&
	identity.profileId === launch.profileId &&
	identity.agentRunId === launch.agentRunId &&
	identity.attemptId === launch.attemptId;

const unavailable = (
	identity: RuntimeCaptureIdentity,
	source: "account-profile" | "opencode-export",
	originalIdentity: string | null,
	code: string,
	message: string,
): RuntimeCaptureUnavailable => ({ identity, sourceKind: source, originalIdentity, code, message });

export async function discoverCapture(
	request: RuntimeCaptureRequest,
	records: SessionRecord[],
	validateStores = false,
): Promise<CaptureDiscovery> {
	const attempts = new Set<string>();
	const identities: RuntimeCaptureIdentity[] = [];
	const workspaces = new Map<string, string[]>();
	const providerScopes: string[] = [];
	const providers: CaptureDiscovery["providers"] = [];
	const unavailableRoots: RuntimeCaptureUnavailable[] = [];
	for (let index = 0; index < request.identities.length; index++) {
		const requested = request.identities[index]!;
		const record = records[index]!;
		if (attempts.has(requested.attemptId)) throw captureError(`Duplicate capture attempt ${requested.attemptId}`);
		attempts.add(requested.attemptId);
		const launch = record.launch?.capture;
		if (launch === undefined || !matchLaunch(requested, launch) || launch.attemptId !== record.session.id)
			throw captureError(`Attempt ${requested.attemptId} has no matching retained capture identity`);
		const providerSessionId = record.observations.agent?.sessionId ?? null;
		if (requested.providerSessionId !== null && requested.providerSessionId !== providerSessionId)
			throw captureError(`Attempt ${requested.attemptId} has a different provider session`);
		const identity = { ...requested, providerSessionId };
		identities.push(identity);
		const workspace = await realpath(record.launch!.cwd);
		workspaces.set(workspace, [...(workspaces.get(workspace) ?? []), identity.attemptId]);
		const launchScopes = launch.providerScopePaths.map((path) => resolve(path));
		providerScopes.push(...launchScopes);
		if (providerSessionId === null) {
			const roots = launch.providerRoots.length === 0 ? [null] : launch.providerRoots;
			for (const root of roots)
				unavailableRoots.push(
					unavailable(
						identity,
						root?.sourceKind ?? sourceKind(identity.harness),
						root?.path ?? null,
						"provider_session_unknown",
						"The exact attempt has no retained provider session.",
					),
				);
			continue;
		}
		if (launch.providerRoots.length === 0) {
			unavailableRoots.push(
				unavailable(
					identity,
					sourceKind(identity.harness),
					null,
					"capture_metadata_missing",
					"The exact attempt has no retained conversation root.",
				),
			);
			continue;
		}
		for (const root of launch.providerRoots) {
			if (root.contentKind !== "conversation-directory")
				throw captureError(`Attempt ${identity.attemptId} has an unsupported provider root`);
			if (root.externalLinks.length > 0) {
				unavailableRoots.push(
					unavailable(
						identity,
						root.sourceKind,
						root.path,
						"external_links_unsupported",
						"The retained conversation root has external links.",
					),
				);
				continue;
			}
			let directory: string;
			try {
				directory = await realpath(root.path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				unavailableRoots.push(
					unavailable(
						identity,
						root.sourceKind,
						root.path,
						"provider_root_missing",
						"The retained conversation root does not exist.",
					),
				);
				continue;
			}
			if (!launchScopes.includes(directory))
				throw captureError(`Attempt ${identity.attemptId} does not exclude its conversation root`);
			providers.push({ identity, root, directory });
		}
	}
	const repositories = await Promise.all(
		[...workspaces].sort(([left], [right]) => left.localeCompare(right)).map(([workspace, attemptIds]) =>
			captureRepositoryIdentity(workspace, attemptIds),
		),
	);
	if (validateStores) {
		const validated = new Set<string>();
		for (const repository of repositories) {
			if (repository.common === null || validated.has(repository.common)) continue;
			await validateGitStore(repository);
			validated.add(repository.common);
		}
	}
	return {
		identities,
		repositories,
		providerScopes: unique(providerScopes),
		providers,
		unavailable: unavailableRoots,
	};
}
