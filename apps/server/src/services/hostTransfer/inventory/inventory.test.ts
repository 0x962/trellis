import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { tempDirs } from "../../../tempDir.ts";
import { inventoryHostTransfer, type HostTransferInventoryInput } from "./inventory.ts";

const tempDir = tempDirs();

const fixture = async () => {
	const root = await tempDir("trellis-host-transfer-");
	const sourceHome = join(root, "Users", "navid");
	const dataHome = join(sourceHome, "Library", "Application Support", "Trellis", "host");
	const destinationHome = join(root, "linux", "home", "navid");
	const destinationDataHome = join(destinationHome, ".trellis");
	const repository = join(sourceHome, "projects", "trellis");
	const worktree = join(dataHome, "agents", "RUN", "work");
	const gitCommonDirectory = join(repository, ".git");
	const profile = join(sourceHome, ".codex-work");
	const transcript = join(dataHome, "agents", "RUN", "output-attempt.txt");
	const escapedProfileLink = join(worktree, "profile-relative-link");
	await Promise.all([
		mkdir(join(dataHome, "db"), { recursive: true }),
		mkdir(join(dataHome, "attachments"), { recursive: true }),
		mkdir(join(dataHome, "pages"), { recursive: true }),
		mkdir(gitCommonDirectory, { recursive: true }),
		mkdir(worktree, { recursive: true }),
		mkdir(profile, { recursive: true }),
		mkdir(join(transcript, ".."), { recursive: true }),
	]);
	await Promise.all([
		writeFile(join(dataHome, "db", "PG_VERSION"), "17"),
		writeFile(join(dataHome, "attachments", "blob.txt"), "attachment"),
		writeFile(join(dataHome, "pages", "page.html"), "<h1>Page</h1>"),
		writeFile(join(gitCommonDirectory, "config"), "[core]\n\tbare = false\n"),
		writeFile(join(repository, "tracked.txt"), "tracked\n"),
		writeFile(join(repository, "dirty.txt"), "dirty\n"),
		writeFile(join(worktree, ".git"), `gitdir: ${join(gitCommonDirectory, "worktrees", "RUN")}\n`),
		writeFile(join(worktree, "new.txt"), "new\n"),
		writeFile(join(profile, "auth.json"), "private"),
		writeFile(transcript, "provider transcript"),
	]);
	await Promise.all([
		symlink("blob.txt", join(dataHome, "attachments", "latest")),
		symlink(repository, join(worktree, "repository-link")),
		symlink(profile, join(worktree, "profile-link")),
		symlink(relative(dirname(escapedProfileLink), join(profile, "auth.json")), escapedProfileLink),
		symlink("/Volumes/private/provider", join(worktree, "unsupported-link")),
	]);

	const input: HostTransferInventoryInput = {
		source: {
			hostId: "mac-host",
			dataHome,
			homeDirectory: sourceHome,
			platform: "darwin",
			arch: "arm64",
		},
		destination: {
			hostId: "linux-host",
			dataHome: destinationDataHome,
			homeDirectory: destinationHome,
			platform: "linux",
			arch: "x64",
		},
		repositories: [
			{
				id: "repository:trellis",
				path: repository,
				destination: { state: "mapped", path: join(destinationHome, "projects", "trellis") },
				secret: true,
			},
		],
		worktrees: [
			{
				id: "worktree:RUN",
				repositoryId: "repository:trellis",
				path: worktree,
				destination: { state: "mapped", path: join(destinationDataHome, "agents", "RUN", "work") },
				secret: true,
			},
		],
		accountProfiles: [{ id: "codex", provider: "codex", path: profile }],
		transcripts: [
			{
				id: "transcript:RUN",
				assignmentId: "RUN",
				provider: "codex",
				path: transcript,
				classification: "portable",
				destination: {
					state: "mapped",
					path: join(destinationDataHome, "agents", "RUN", "output-attempt.txt"),
				},
				secret: true,
			},
		],
		absolutePaths: [
			{
				id: "path:project-directory",
				field: "projects.repository_dir",
				path: repository,
				classification: "remappable",
				destination: { state: "mapped", path: join(destinationHome, "projects", "trellis") },
				secret: false,
			},
		],
		providerResumeCompatibility: [
			{
				assignmentId: "RUN",
				provider: "codex",
				sessionId: "thread-1",
				state: "unavailable",
				reason: "The provider has no verified Linux resume proof.",
			},
		],
	};
	const git = async (workspace: string, args: string[]) => {
		if (args[0] === "rev-parse") return `${gitCommonDirectory}\n`;
		return workspace === repository ? " M dirty.txt\0" : "?? new.txt\0";
	};
	return { input, git, repository, worktree, gitCommonDirectory, sourceHome, destinationHome };
};

test("describes every portable host object without copying it", async () => {
	const prepared = await fixture();
	const manifest = await inventoryHostTransfer(prepared.input, {
		git: prepared.git,
		now: () => new Date("2026-09-27T20:00:00.000Z"),
	});

	expect(manifest.version).toBe(1);
	expect(manifest.createdAt).toBe("2026-09-27T20:00:00.000Z");
	expect(new Set(manifest.objects.map((object) => object.kind))).toEqual(
		new Set([
			"database",
			"attachments",
			"pages",
			"repository",
			"git-common-directory",
			"worktree",
			"account-profile",
			"transcript",
			"absolute-path",
			"symlink",
		]),
	);
	for (const object of manifest.objects) {
		expect(object.bytes).toBeGreaterThanOrEqual(0);
		expect(object.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(["mapped", "excluded"]).toContain(object.destination.state);
	}
	const repository = manifest.objects.find((object) => object.id === "repository:trellis");
	const worktree = manifest.objects.find((object) => object.id === "worktree:RUN");
	if (repository?.kind !== "repository" || worktree?.kind !== "worktree") throw new Error("Missing Git objects");
	expect(repository.dirtyPaths).toEqual(["dirty.txt"]);
	expect(worktree.dirtyPaths).toEqual(["new.txt"]);
	expect(worktree.gitCommonDirectoryId).toBe(repository.gitCommonDirectoryId);
	const common = manifest.objects.find((object) => object.id === repository.gitCommonDirectoryId);
	if (common?.kind !== "git-common-directory") throw new Error("Missing Git common directory");
	expect(common.checkoutIds).toEqual(["repository:trellis", "worktree:RUN"]);

	const profile = manifest.objects.find((object) => object.kind === "account-profile");
	expect(profile?.classification).toBe("reauthenticated");
	expect(profile?.destination.state).toBe("excluded");
	expect(profile?.sourcePath).toBe(join(prepared.sourceHome, ".codex-work"));
	const path = manifest.objects.find((object) => object.kind === "absolute-path");
	expect(path?.sourcePath).toBe(join(prepared.sourceHome, "projects", "trellis"));
	expect(path?.destination).toEqual({
		state: "mapped",
		path: join(prepared.destinationHome, "projects", "trellis"),
	});
	const links = manifest.objects.filter((object) => object.kind === "symlink");
	expect(links.some((link) => link.target === "blob.txt" && link.classification === "portable")).toBeTrue();
	expect(
		links.some(
			(link) =>
				link.target === prepared.repository &&
				link.destinationTarget === join(prepared.destinationHome, "projects", "trellis"),
		),
	).toBeTrue();
	expect(
		links.some(
			(link) => link.target === join(prepared.sourceHome, ".codex-work") && link.destination.state === "excluded",
		),
	).toBeTrue();
	expect(links.some((link) => link.target.startsWith("/Volumes/") && link.destination.state === "excluded")).toBeTrue();
	expect(
		links.some(
			(link) =>
				link.target.endsWith(".codex-work/auth.json") &&
				link.destination.state === "excluded" &&
				link.destinationTarget === null,
		),
	).toBeTrue();
	expect(manifest.providerResumeCompatibility).toEqual(prepared.input.providerResumeCompatibility);
	expect(manifest.objects.find((object) => object.kind === "database")?.secret).toBeTrue();
	expect(manifest.totals.objectCount).toBe(manifest.objects.length);
	expect(existsSync(prepared.destinationHome)).toBeFalse();
	expect(await readFile(join(prepared.repository, "dirty.txt"), "utf8")).toBe("dirty\n");
	expect(await readlink(join(prepared.worktree, "repository-link"))).toBe(prepared.repository);
});

test("changes a directory checksum when a dirty file changes", async () => {
	const prepared = await fixture();
	const first = await inventoryHostTransfer(prepared.input, { git: prepared.git });
	await writeFile(join(prepared.repository, "dirty.txt"), "changed\n");
	const second = await inventoryHostTransfer(prepared.input, { git: prepared.git });
	expect(first.objects.find((object) => object.id === "repository:trellis")?.sha256).not.toBe(
		second.objects.find((object) => object.id === "repository:trellis")?.sha256,
	);
});

test("rejects an inventory when the source database is absent", async () => {
	const prepared = await fixture();
	await rm(join(prepared.input.source.dataHome, "db"), { recursive: true });
	await expect(inventoryHostTransfer(prepared.input, { git: prepared.git })).rejects.toThrow("ENOENT");
});

test("records absent optional data directories", async () => {
	const prepared = await fixture();
	await Promise.all([
		rm(join(prepared.input.source.dataHome, "attachments"), { recursive: true }),
		rm(join(prepared.input.source.dataHome, "pages"), { recursive: true }),
	]);
	const manifest = await inventoryHostTransfer(prepared.input, { git: prepared.git });
	for (const kind of ["attachments", "pages"] as const) {
		const object = manifest.objects.find((entry) => entry.kind === kind);
		expect(object?.classification).toBe("unsupported");
		expect(object?.destination.state).toBe("excluded");
		expect(object?.bytes).toBe(0);
	}
});
