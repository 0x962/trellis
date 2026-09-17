import { afterEach, beforeEach, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertProductionSource } from "../../../../src/productionSource/productionSource.ts";

const execute = promisify(execFile);
let root: string;
let repo: string;
let remote: string;
let original: string;
const git = async (...args: string[]) => (await execute("/usr/bin/git", args, { cwd: repo })).stdout.trim();
const commit = async (message: string) => {
	await git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", message);
	return git("rev-parse", "HEAD");
};

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "trellis-production-source-"));
	repo = root;
	remote = join(root, "origin.git");
	await git("init", "--bare", "--initial-branch=main", remote);
	const checkout = join(root, "checkout");
	await git("clone", remote, checkout);
	repo = checkout;
	await git("config", "user.name", "Trellis test");
	await git("config", "user.email", "test@trellis.invalid");
	original = await commit("Main source");
	await git("push", "origin", "main");
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

test("a clean main checkout equal to freshly fetched origin/main can build", async () => {
	await expect(assertProductionSource(repo, { phase: "build" })).resolves.toBe(original);
});

test("a feature branch cannot build even at the published main commit", async () => {
	await git("checkout", "-b", "feature");
	await expect(assertProductionSource(repo, { phase: "build" })).rejects.toThrow("clean main checkout");
});

test("a detached checkout cannot build even at the published main commit", async () => {
	await git("checkout", "--detach");
	await expect(assertProductionSource(repo, { phase: "build" })).rejects.toThrow("clean main checkout");
});

test("uncommitted source blocks production builds", async () => {
	await writeFile(join(repo, "uncommitted.txt"), "source");
	await expect(assertProductionSource(repo, { phase: "build" })).rejects.toThrow("Commit all source changes");
});

test("unpushed main cannot build", async () => {
	const local = await commit("Unpublished source");
	const error = await assertProductionSource(repo, { phase: "build" }).catch((cause: Error) => cause);
	expect(String(error)).toContain(local);
	expect(String(error)).toContain(original);
	expect(String(error)).toContain("must equal freshly fetched origin/main");
});

test("stale local and cached remote refs cannot build", async () => {
	const published = await commit("New main source");
	await git("push", "origin", "main");
	await git("reset", "--hard", original);
	await git("update-ref", "refs/remotes/origin/main", original);
	const error = await assertProductionSource(repo, { phase: "build" }).catch((cause: Error) => cause);
	expect(String(error)).toContain(published);
	expect(String(error)).toContain("must equal freshly fetched origin/main");
	expect(await git("rev-parse", "origin/main")).toBe(published);
});

test("publication allows main to advance while it retains the built commit", async () => {
	const source = await assertProductionSource(repo, { phase: "build" });
	const published = await commit("Later main source");
	await git("push", "origin", "main");
	await git("update-ref", "refs/remotes/origin/main", original);
	await expect(assertProductionSource(repo, { phase: "publish", commit: source })).resolves.toBe(original);
	expect(await git("rev-parse", "origin/main")).toBe(published);
});

test("publication refuses a built commit removed from origin/main during the build", async () => {
	const source = await commit("Candidate source");
	await git("push", "origin", "main");
	await assertProductionSource(repo, { phase: "build" });
	await git("reset", "--hard", original);
	const replacement = await commit("Replacement main source");
	await git("push", "--force", "origin", "main");
	await git("update-ref", "refs/remotes/origin/main", source);
	const error = await assertProductionSource(repo, { phase: "publish", commit: source }).catch((cause: Error) => cause);
	expect(String(error)).toContain(source);
	expect(String(error)).toContain(replacement);
	expect(String(error)).toContain("is not part of freshly fetched origin/main");
});

test("a failed fetch cannot use a cached origin/main", async () => {
	await rm(remote, { recursive: true });
	await expect(assertProductionSource(repo, { phase: "build" })).rejects.toThrow();
	await expect(assertProductionSource(repo, { phase: "publish", commit: original })).rejects.toThrow();
});
