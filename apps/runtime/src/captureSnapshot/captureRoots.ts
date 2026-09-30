import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { RuntimeCaptureEntry } from "@trellis/runtime-protocol";
import { captureError } from "./captureError.ts";
import type { CaptureDiscovery, CaptureRootState } from "./types.ts";

const inside = (root: string, path: string) => path === root || path.startsWith(`${root}${sep}`);

export const captureRelativePath = (path: string) => {
	if (path === "" || path.startsWith("/") || path.split(/[\\/]/).includes(".."))
		throw captureError(`Capture path is not relative: ${path}`);
	return path.replaceAll("\\", "/");
};

export function buildCaptureRoots(discovery: CaptureDiscovery) {
	const states: CaptureRootState[] = [];
	const byDirectory = new Map<string, CaptureRootState>();
	const root = (kind: "git" | "common", directory: string, objectFormat: "sha1" | "sha256") => {
		let state = byDirectory.get(directory);
		if (state === undefined) {
			state = {
				root: {
					rootId: randomUUID(),
					kind,
					sourceKind: kind === "git" ? "git-directory" : "common-directory",
					originalIdentity: directory,
					objectFormat,
				},
				directory,
				excluded: [],
			};
			byDirectory.set(directory, state);
			states.push(state);
		} else if ((state.root.kind !== "git" && state.root.kind !== "common") || state.root.objectFormat !== objectFormat)
			throw captureError(`Git root identity changed for ${directory}`);
		return state.root.rootId;
	};
	const workspaces = discovery.repositories.map((repository) => {
		const worktreeRootId = randomUUID();
		states.push({
			root: {
				rootId: worktreeRootId,
				kind: "worktree",
				sourceKind: "workspace",
				originalIdentity: repository.workspace,
			},
			directory: repository.workspace,
			excluded: [".git"],
		});
		return {
			workspaceId: repository.workspace,
			attemptIds: repository.attemptIds,
			worktreeRootId,
			gitRootId:
				repository.git === null || repository.objectFormat === null
					? null
					: root("git", repository.git, repository.objectFormat),
			commonRootId:
				repository.common === null || repository.objectFormat === null
					? null
					: root("common", repository.common, repository.objectFormat),
		};
	});
	for (const provider of discovery.providers)
		states.push({
			root: {
				rootId: randomUUID(),
				kind: "conversation",
				sourceKind: provider.root.sourceKind,
				originalIdentity: provider.identity.attemptId,
				identity: provider.identity,
			},
			directory: provider.directory,
			excluded: [],
		});
	return { states, workspaces };
}

const isExcluded = (path: string, exclusions: string[]) =>
	exclusions.some((entry) => path === entry || path.startsWith(`${entry}/`));

const fileIdentity = async (path: string, signal?: AbortSignal) => {
	const hash = createHash("sha256");
	let size = 0;
	for await (const chunk of createReadStream(path)) {
		signal?.throwIfAborted();
		const bytes = Buffer.from(chunk);
		hash.update(bytes);
		size += bytes.length;
	}
	return { size, sha256: hash.digest("hex") };
};

export async function inventoryCaptureRoot(
	state: CaptureRootState,
	signal?: AbortSignal,
): Promise<RuntimeCaptureEntry[]> {
	const entries: RuntimeCaptureEntry[] = [];
	const visit = async (directory: string, prefix: string) => {
		for (const name of (await readdir(directory)).sort()) {
			signal?.throwIfAborted();
			const path = prefix === "" ? name : `${prefix}/${name}`;
			if (isExcluded(path, state.excluded)) continue;
			const source = join(directory, name);
			const status = await lstat(source);
			if (status.isSymbolicLink()) {
				const target = await readlink(source);
				const destination = isAbsolute(target) ? target : await realpath(resolve(dirname(source), target));
				if (isAbsolute(target) || !inside(state.directory, destination))
					throw captureError(`Capture symlink escapes ${state.root.rootId}: ${path}`);
				entries.push({ rootId: state.root.rootId, path, kind: "symlink", target });
			} else if (status.isDirectory()) {
				entries.push({ rootId: state.root.rootId, path, kind: "directory", mode: status.mode & 0o777 });
				await visit(source, path);
			} else if (status.isFile()) {
				entries.push({
					rootId: state.root.rootId,
					path,
					kind: "file",
					mode: status.mode & 0o777,
					...(await fileIdentity(source, signal)),
				});
			} else throw captureError(`Capture entry has an unsupported kind: ${path}`);
		}
	};
	await visit(state.directory, "");
	return entries;
}
