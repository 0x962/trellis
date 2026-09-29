import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceBinding, WorkspaceCaptureReader, WorkspaceInventory } from "../../../../../apps/server/src/services/langflowBackup/workspaceArchive";

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
	const binding: WorkspaceBinding = {
		captureId: "synthetic-capture", snapshotId: "00000000-0000-4000-8000-000000000001",
		hostId: "00000000-0000-4000-8000-000000000002", dataHomeId: "00000000-0000-4000-8000-000000000003",
		blockId: "00000000-0000-4000-8000-000000000004", generation: 1,
		workspaceId: worktree, runs: [{ runId: "original-run", attemptId: "original-attempt" }],
	};
	const inventory: WorkspaceInventory = { binding, repository: { gitDirectory, commonDirectory, objectFormat: "sha1" }, entries: [] };
	const roots = { worktree, git: gitDirectory, common: commonDirectory };
	for (const root of ["worktree", "git", "common"] as const) {
		const visit = async (path: string): Promise<void> => {
			if ((root === "worktree" && path === ".git") || (root === "common" && path === "worktrees")) return;
			const absolute = join(roots[root], path);
			const stat = await lstat(absolute);
			if (stat.isSymbolicLink()) inventory.entries.push({ root, path, kind: "symlink", target: await readlink(absolute) });
			else if (stat.isDirectory()) {
				inventory.entries.push({ root, path, kind: "directory", mode: stat.mode & 0o777 });
				for (const name of (await readdir(absolute)).sort()) await visit(`${path}/${name}`);
			} else inventory.entries.push({ root, path, kind: "file", mode: stat.mode & 0o777 });
		};
		for (const name of (await readdir(roots[root])).sort()) await visit(name);
	}
	const reader: WorkspaceCaptureReader = {
		async list() { return structuredClone(inventory); },
		async *read(_binding, location) { yield await readFile(join(roots[location.root], location.path)); },
	};
	const liveHome = join(directory, "live");
	await mkdir(liveHome);
	return { directory, worktree, repository, inventory, binding, reader, liveHome, archive: join(directory, "export"), destination: join(directory, "restore") };
}
