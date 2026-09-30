import { createHash } from "node:crypto";
import type { RuntimeCaptureInventory } from "@trellis/runtime-protocol";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceBinding, WorkspaceCaptureReader } from "../../../../../apps/server/src/services/langflowBackup/workspaceArchive";

export async function git(directory: string, ...args: string[]) {
	const child = Bun.spawn(["git", "-c", "commit.gpgsign=false", "-C", directory, ...args], {
		env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test",
			GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test" },
		stdout: "pipe", stderr: "pipe",
	});
	const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if (exit !== 0) throw new Error(stderr);
	return stdout;
}

export async function workspaceFixture(register: (path: string) => void) {
	const directory = await mkdtemp(join(tmpdir(), "trellis-workspace-archive-"));
	register(directory);
	const repository = join(directory, "repository");
	await mkdir(repository);
	await git(repository, "init", "--object-format=sha1");
	await writeFile(join(repository, "tracked.txt"), "original\n");
	await git(repository, "add", "tracked.txt");
	await git(repository, "commit", "-m", "Synthetic fixture");
	await git(repository, "remote", "add", "origin", "https://example.test/retained.git");
	const worktree = join(directory, "source-worktree");
	await git(repository, "worktree", "add", "--detach", worktree);
	await writeFile(join(worktree, "tracked.txt"), "staged\n");
	await git(worktree, "add", "tracked.txt");
	await writeFile(join(worktree, "tracked.txt"), "dirty\n");
	await writeFile(join(worktree, "untracked.sh"), "#!/bin/sh\nprintf fixture\n");
	await chmod(join(worktree, "untracked.sh"), 0o755);
	await symlink("tracked.txt", join(worktree, "link"));
	const gitDirectory = (await git(worktree, "rev-parse", "--absolute-git-dir")).trim();
	const commonDirectory = join(repository, ".git");
	const rootIds = { worktree: "opaque-w", git: "opaque-g", common: "opaque-c" };
	const binding: WorkspaceBinding = {
		captureId: "synthetic-capture", snapshotId: "00000000-0000-4000-8000-000000000001",
		hostId: "00000000-0000-4000-8000-000000000002", dataHomeId: "00000000-0000-4000-8000-000000000003",
		blockId: "00000000-0000-4000-8000-000000000004", generation: 1,
		workspaces: [{ workspaceId: worktree, attemptIds: ["original-attempt"], worktreeRootId: rootIds.worktree, gitRootId: rootIds.git, commonRootId: rootIds.common }], identities: [{ harness: "codex", accountId: "account", profileId: "profile", agentRunId: "original-run", attemptId: "original-attempt", providerSessionId: "synthetic-session" }],
		roots: [
			{ rootId: rootIds.worktree, kind: "worktree", sourceKind: "workspace", originalIdentity: worktree },
			{ rootId: rootIds.git, kind: "git", sourceKind: "git-directory", originalIdentity: gitDirectory, objectFormat: "sha1" },
			{ rootId: rootIds.common, kind: "common", sourceKind: "common-directory", originalIdentity: commonDirectory, objectFormat: "sha1" },
		],
	};
	const inventory: RuntimeCaptureInventory = { binding, entries: [], unavailable: [] };
	const roots = { worktree, git: gitDirectory, common: commonDirectory };
	for (const root of ["worktree", "git", "common"] as const) {
		const visit = async (path: string): Promise<void> => {
			if ((root === "worktree" && path === ".git") || (root === "common" && path === "worktrees")) return;
			const absolute = join(roots[root], path);
			const stat = await lstat(absolute);
			if (stat.isSymbolicLink()) inventory.entries.push({ rootId: rootIds[root], path, kind: "symlink", target: await readlink(absolute) });
			else if (stat.isDirectory()) {
				inventory.entries.push({ rootId: rootIds[root], path, kind: "directory", mode: stat.mode & 0o777 });
				for (const name of (await readdir(absolute)).sort()) await visit(`${path}/${name}`);
			} else {
				const bytes = await readFile(absolute);
				inventory.entries.push({ rootId: rootIds[root], path, kind: "file", mode: stat.mode & 0o777, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
			}
		};
		for (const name of (await readdir(roots[root])).sort()) await visit(name);
	}
	const reader: WorkspaceCaptureReader = {
		signal: new AbortController().signal,
		binding,
		async inventory() { return structuredClone(inventory); },
		async *read(input) {
			const root = (Object.keys(rootIds) as (keyof typeof roots)[]).find((root) => rootIds[root] === input.rootId)!;
			yield await readFile(join(roots[root], input.path));
		},
		async seal(input) { return new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, kind: "trellis-runtime-capture-seal", ...input }, null, 2)); },
	};
	const liveHome = join(directory, "live");
	await mkdir(liveHome);
	return { directory, worktree, repository, inventory, binding, reader, rootIds, liveHome, archive: join(directory, "export"), destination: join(directory, "restore") };
}
