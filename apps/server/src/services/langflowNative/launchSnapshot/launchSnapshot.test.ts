import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLaunchSnapshot, writeLaunchSnapshot } from "./launchSnapshot";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
	const home = await mkdtemp(join(tmpdir(), "trellis-native-snapshot-"));
	roots.push(home);
	const attempt = crypto.randomUUID();
	return { home, attempt, path: join(home, "harness-attempts", attempt, "langflow-launch.json") };
}

test("retains exact private bytes and refuses replacement or corruption", async () => {
	const f = await fixture();
	const bytes = JSON.stringify({ token: "fixture-private-token", instruction: "x".repeat(1_100_000) });
	const digest = await writeLaunchSnapshot(f.home, f.attempt, bytes);
	expect(await readLaunchSnapshot(f.home, f.attempt, digest)).toBe(bytes);
	await expect(writeLaunchSnapshot(f.home, f.attempt, "replacement")).rejects.toThrow();
	expect(await readFile(f.path, "utf8")).toBe(bytes);
	await writeFile(f.path, "changed");
	await expect(readLaunchSnapshot(f.home, f.attempt, digest)).rejects.toThrow("native_snapshot_digest_conflict");
});

test("rejects a public file and a substituted symlink", async () => {
	const f = await fixture();
	const digest = await writeLaunchSnapshot(f.home, f.attempt, "fixture");
	await chmod(f.path, 0o644);
	await expect(readLaunchSnapshot(f.home, f.attempt, digest)).rejects.toThrow("native_snapshot_file_unsafe");
	await rm(f.path);
	await symlink(join(f.home, "target"), f.path);
	await expect(readLaunchSnapshot(f.home, f.attempt, digest)).rejects.toThrow();
});
