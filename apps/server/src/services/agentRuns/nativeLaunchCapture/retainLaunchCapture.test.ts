import { expect, test } from "bun:test";
import { mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tempDirs } from "../../../tempDir";
import { providerRoots } from "./providerRoots";
import { readNativeCaptureIdentity } from "./readNativeCaptureIdentity";
import { retainLaunchCapture } from "./retainLaunchCapture";

const temporary = tempDirs();

async function fixture() {
	const home = await temporary("trellis-launch-capture-");
	const path = join(home, "synthetic-profile");
	await mkdir(path);
	return {
		home,
		harness: "codex" as const,
		accountId: "account-original",
		agentRunId: "run-original",
		attemptId: "attempt-original",
		provider: await providerRoots("codex", path),
		priorScopePaths: [],
	};
}

test("retains a separate profile UUID and exact attempt metadata before launch", async () => {
	const input = await fixture();
	const first = await retainLaunchCapture(input);
	expect(first!.profileId).toMatch(/^[a-f0-9-]{36}$/);
	expect(first!.profileId).not.toBe(input.accountId);
	expect(first!.profileId).not.toBe(input.provider.profilePath);
	expect(first!.providerRoots.map((root) => root.path)).toEqual([
		join(input.provider.profilePath!, "sessions"), join(input.provider.profilePath!, "archived_sessions"),
	]);
	const path = join(input.home, "harness-attempts", input.attemptId, "capture.json");
	const bytes = await readFile(path);
	expect(await retainLaunchCapture(input)).toEqual(first);
	expect(await readFile(path)).toEqual(bytes);
	expect((await stat(path)).mode & 0o777).toBe(0o600);
	expect((await stat(join(input.home, "harness-attempts", input.attemptId))).mode & 0o777).toBe(0o700);
});

test("another attempt retains the same selected profile identity", async () => {
	const input = await fixture();
	const first = await retainLaunchCapture(input);
	const second = await retainLaunchCapture({ ...input, attemptId: "attempt-next" });
	expect(second!.profileId).toBe(first!.profileId);
	expect(second!.attemptId).toBe("attempt-next");
});

test("a changed selection cannot overwrite retained metadata", async () => {
	const input = await fixture();
	await retainLaunchCapture(input);
	await expect(retainLaunchCapture({ ...input, accountId: "other-account" })).rejects.toThrow("native_capture_selection_conflict");
});

test("a historical descriptor remains without capture metadata", async () => {
	const input = await fixture();
	const directory = join(input.home, "harness-attempts", input.attemptId);
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "launch.json"), JSON.stringify({ spec: { id: input.attemptId } }));
	expect(await retainLaunchCapture(input)).toBeUndefined();
	expect(await Bun.file(join(directory, "capture.json")).exists()).toBe(false);
});

test("shared session links remain explicit while credentials stay outside the roots", async () => {
	const input = await fixture();
	const shared = join(input.home, "shared-sessions");
	await mkdir(shared);
	await symlink(shared, join(input.provider.profilePath!, "sessions"));
	await writeFile(join(input.provider.profilePath!, "auth.json"), "synthetic secret");
	const selected = await providerRoots("codex", input.provider.profilePath!);
	expect(selected.roots[0]!.path).toBe(shared);
	expect(selected.roots[0]!.externalLinks).toEqual([{
		path: join(input.provider.profilePath!, "sessions"), target: shared,
	}]);
	expect(selected.roots.some((root) => root.path === input.provider.profilePath)).toBe(false);
	expect(selected.paths).toContain(shared);
});

test("OpenCode has no readable root without a retained provider export", async () => {
	const input = await fixture();
	const selected = await providerRoots("opencode", input.provider.profilePath!);
	expect(selected.roots).toEqual([]);
	expect(selected.paths).toContain(input.provider.profilePath!);
});

test("identity enumeration reports missing metadata without a runtime", async () => {
	const input = await fixture();
	expect(await readNativeCaptureIdentity(input.home, input.attemptId)).toEqual({
		state: "unavailable", reason: "capture_launch_identity_missing",
	});
});

test("an incomplete launch retains the same profile identity across metadata reopen", async () => {
	const input = await fixture();
	const capture = await retainLaunchCapture(input);
	const path = join(input.home, "harness-attempts", input.attemptId, "capture.json");
	const bytes = await readFile(path, "utf8");
	expect(JSON.parse(bytes)).toEqual(capture);
	await expect(retainLaunchCapture({ ...input, priorScopePaths: [join(input.home, "old-profile")] }))
		.rejects.toThrow("native_capture_selection_conflict");
});
