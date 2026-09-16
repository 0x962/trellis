import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { installApplication } from "../../../../src/installApplication/installApplication.ts";
import { assertInstalledAncestry } from "../../../../src/installedAncestry/installedAncestry.ts";

const execute = promisify(execFile);
let root: string;
let repo: string;
let base: string;
let candidate: string;
let divergent: string;
const git = async (...args: string[]) => (await execute("/usr/bin/git", args, { cwd: repo })).stdout.trim();
const installMetadata = async (application: string, commit: string) => {
	const resources = join(application, "Contents/Resources/host");
	await mkdir(resources, { recursive: true });
	await writeFile(join(resources, "build.json"), JSON.stringify({ commit }));
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "trellis-ancestry-test-"));
	repo = join(root, "source");
	await mkdir(repo);
	await git("init", "--quiet");
	await git("config", "user.name", "Trellis test");
	await git("config", "user.email", "test@trellis.invalid");
	await git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Base");
	base = await git("rev-parse", "HEAD");
	await git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Candidate");
	candidate = await git("rev-parse", "HEAD");
	await git("checkout", "--detach", base);
	await git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Other installation");
	divergent = await git("rev-parse", "HEAD");
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

test("a first install needs no installed commit", async () => {
	await expect(assertInstalledAncestry(repo, candidate, join(root, "absent.app"))).resolves.toBeUndefined();
});

test("a descendant or identical candidate preserves installed source", async () => {
	const application = join(root, "ancestor.app");
	await installMetadata(application, base);
	await expect(assertInstalledAncestry(repo, candidate, application)).resolves.toBeUndefined();
	await expect(assertInstalledAncestry(repo, base, application)).resolves.toBeUndefined();
});

test("a divergent candidate fails with both commits and the integration instruction", async () => {
	const application = join(root, "divergent.app");
	await installMetadata(application, divergent);
	const error = await assertInstalledAncestry(repo, candidate, application).catch((cause: Error) => cause);
	expect(error).toBeInstanceOf(Error);
	expect(String(error)).toContain(candidate);
	expect(String(error)).toContain(divergent);
	expect(String(error)).toContain("Integrate the installed source");
});

test("a changed installed commit blocks publication after the build preflight passes", async () => {
	const application = join(root, "changed.app");
	const prepared = join(root, "prepared.app");
	await installMetadata(application, base);
	await installMetadata(prepared, candidate);
	await assertInstalledAncestry(repo, candidate, application);
	await expect(
		installApplication(prepared, application, async () => {
			await installMetadata(application, divergent);
			await assertInstalledAncestry(repo, candidate, application);
		}),
	).rejects.toThrow("Integrate the installed source");
	expect(JSON.parse(await readFile(join(application, "Contents/Resources/host/build.json"), "utf8")).commit).toBe(
		divergent,
	);
});

test("an unavailable installed commit fails with source integration instructions", async () => {
	const application = join(root, "unknown.app");
	const unknown = "a".repeat(40);
	await installMetadata(application, unknown);
	const error = await assertInstalledAncestry(repo, candidate, application).catch((cause: Error) => cause);
	expect(String(error)).toContain(candidate);
	expect(String(error)).toContain(unknown);
	expect(String(error)).toContain("Integrate the installed source");
});

test("an existing app without a valid source commit does not bypass the check", async () => {
	const application = join(root, "invalid.app");
	await installMetadata(application, "");
	await expect(assertInstalledAncestry(repo, candidate, application)).rejects.toThrow("has no valid source commit");
	await rm(join(application, "Contents/Resources/host/build.json"));
	await expect(assertInstalledAncestry(repo, candidate, application)).rejects.toThrow("ENOENT");
});
