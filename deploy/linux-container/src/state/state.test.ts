import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containerPaths, prepareContainerState } from "./index.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("keeps the installation identity and token in owner-only persistent metadata", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-container-"));
	roots.push(root);
	const first = await prepareContainerState(root, 4521, "a".repeat(64));
	const second = await prepareContainerState(root, 5521, "b".repeat(64));
	expect(second.metadata.installationId).toBe(first.metadata.installationId);
	expect(second.authToken).toBe(first.authToken);
	expect(second.metadata.forwardedPort).toBe(5521);
	expect(second.metadata.releaseId).toBe("b".repeat(64));
	expect((await stat(second.paths.bootstrap)).mode & 0o777).toBe(0o600);
	expect((await stat(second.paths.authToken)).mode & 0o777).toBe(0o600);
	expect((await stat(second.paths.container)).mode & 0o777).toBe(0o700);
});

test("removes a stale replacement marker only after a new supervisor starts", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-container-"));
	roots.push(root);
	const paths = containerPaths(root);
	await mkdir(paths.container, { recursive: true });
	await writeFile(paths.replacementReady, "ready");
	await prepareContainerState(root, 4521, "a".repeat(64));
	expect(await Bun.file(paths.replacementReady).exists()).toBe(false);
});

test("refuses an incomplete persistent identity without overwriting it", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-container-"));
	roots.push(root);
	const paths = containerPaths(root);
	await mkdir(paths.container, { recursive: true });
	await writeFile(paths.bootstrap, "{}\n");
	await expect(prepareContainerState(root, 4521, "a".repeat(64))).rejects.toThrow(
		"The installation identity is incomplete",
	);
	expect(await readFile(paths.bootstrap, "utf8")).toBe("{}\n");
	expect(await Bun.file(paths.authToken).exists()).toBe(false);
});

test("refuses invalid persistent metadata without overwriting either record", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-container-"));
	roots.push(root);
	const paths = containerPaths(root);
	await mkdir(paths.container, { recursive: true });
	await writeFile(paths.bootstrap, "{}\n");
	await writeFile(paths.authToken, `${"a".repeat(64)}\n`);
	await expect(prepareContainerState(root, 4521, "a".repeat(64))).rejects.toThrow(
		"The bootstrap metadata is invalid",
	);
	expect(await readFile(paths.bootstrap, "utf8")).toBe("{}\n");
	expect(await readFile(paths.authToken, "utf8")).toBe(`${"a".repeat(64)}\n`);
});
