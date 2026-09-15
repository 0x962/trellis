import { afterEach, beforeEach, expect, test } from "bun:test";
import { lstat, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lock } from "proper-lockfile";
import { HarnessHost } from "../../../../../src/agents/harnessHost/harnessHost.ts";
import { harnessHostFixture } from "../../../../helpers/harnessHostFixture.ts";

let fixture: Awaited<ReturnType<typeof harnessHostFixture>>;
beforeEach(async () => {
	fixture = await harnessHostFixture();
});
afterEach(async () => {
	await fixture.client.shutdown();
	await new Promise<void>((done) => fixture.daemon.once("exit", () => done()));
	await rm(fixture.home, { recursive: true, force: true });
});
const hostFor = (env: Record<string, string>) =>
	new HarnessHost({
		runtime: fixture.client,
		directory: join(fixture.home, "attempts"),
		env: { HOME: fixture.home, PATH: join(fixture.home, "bin"), ...env },
		bun: process.execPath,
	});
const prepare = (host: HarnessHost, cwd: string) =>
	host.prepare({ id: crypto.randomUUID(), harness: "claude", cwd, prompt: "Respond ready" });

test("Claude trusts the canonical launch directory and preserves native account state", async () => {
	const cwd = join(fixture.home, "repo");
	const alias = join(fixture.home, "alias");
	await mkdir(cwd);
	await symlink(cwd, alias);
	const stateFile = join(fixture.home, ".claude.json");
	const state = { oauthAccount: { accountUuid: "account" }, projects: { "/other": { allowedTools: ["Read"] } } };
	await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
	await prepare(hostFor({}), alias);
	expect(JSON.parse(await readFile(stateFile, "utf8"))).toEqual({
		...state,
		projects: { ...state.projects, [await realpath(cwd)]: { hasTrustDialogAccepted: true } },
	});
	expect((await stat(stateFile)).mode & 0o777).toBe(0o600);
});

test("Claude uses the selected profile and preserves its existing project settings", async () => {
	const config = join(fixture.home, "profile");
	await mkdir(config);
	const cwd = await realpath(fixture.home);
	const stateFile = join(config, ".claude.json");
	await writeFile(
		stateFile,
		JSON.stringify({ projects: { [cwd]: { allowedTools: ["Bash"], hasTrustDialogAccepted: false } } }),
	);
	await prepare(hostFor({ CLAUDE_CONFIG_DIR: config }), cwd);
	expect(JSON.parse(await readFile(stateFile, "utf8")).projects[cwd]).toEqual({
		allowedTools: ["Bash"],
		hasTrustDialogAccepted: true,
	});
	expect(await Bun.file(join(fixture.home, ".claude.json")).exists()).toBe(false);
});

test("Claude preserves its legacy state file and rejects corrupt native state", async () => {
	const config = join(fixture.home, ".claude");
	await mkdir(config);
	const stateFile = join(config, ".config.json");
	await writeFile(stateFile, "invalid native config");
	await expect(prepare(hostFor({}), fixture.home)).rejects.toThrow();
	expect(await readFile(stateFile, "utf8")).toBe("invalid native config");
	expect(await Bun.file(join(fixture.home, ".claude.json")).exists()).toBe(false);
});

test("Claude creates owner-only native trust state for a new profile", async () => {
	await prepare(hostFor({}), fixture.home);
	const stateFile = join(fixture.home, ".claude.json");
	expect(JSON.parse(await readFile(stateFile, "utf8"))).toEqual({
		projects: { [await realpath(fixture.home)]: { hasTrustDialogAccepted: true } },
	});
	expect((await stat(stateFile)).mode & 0o777).toBe(0o600);
});

test("Claude waits for the native config lock and reads the state after the native writer finishes", async () => {
	const stateFile = join(fixture.home, ".claude.json");
	await writeFile(stateFile, JSON.stringify({ oauthAccount: { accountUuid: "before" } }));
	const release = await lock(stateFile, { lockfilePath: `${stateFile}.lock` });
	let prepared = false;
	const pending = prepare(hostFor({}), fixture.home).then(() => {
		prepared = true;
	});
	await new Promise((done) => setTimeout(done, 100));
	expect(prepared).toBe(false);
	await writeFile(stateFile, JSON.stringify({ oauthAccount: { accountUuid: "after" }, nativeCounter: 3 }));
	await release();
	await pending;
	expect(JSON.parse(await readFile(stateFile, "utf8"))).toMatchObject({
		oauthAccount: { accountUuid: "after" },
		nativeCounter: 3,
		projects: { [await realpath(fixture.home)]: { hasTrustDialogAccepted: true } },
	});
});

test("Concurrent Claude starts preserve every trusted directory", async () => {
	const directories = await Promise.all(
		Array.from({ length: 8 }, async (_, index) => {
			const directory = join(fixture.home, `repo-${index}`);
			await mkdir(directory);
			return realpath(directory);
		}),
	);
	await Promise.all(directories.map((cwd) => prepare(hostFor({}), cwd)));
	const state = JSON.parse(await readFile(join(fixture.home, ".claude.json"), "utf8"));
	expect(Object.keys(state.projects).sort()).toEqual(directories.sort());
});

test("Claude keeps the native state symlink and skips writes for a trusted directory", async () => {
	const stateFile = join(fixture.home, ".claude.json");
	const target = join(fixture.home, "account-state.json");
	await writeFile(target, JSON.stringify({ account: "preserved" }), { mode: 0o640 });
	await symlink(target, stateFile);
	await prepare(hostFor({}), fixture.home);
	expect((await lstat(stateFile)).isSymbolicLink()).toBe(true);
	expect(JSON.parse(await readFile(target, "utf8"))).toMatchObject({
		account: "preserved",
		projects: { [await realpath(fixture.home)]: { hasTrustDialogAccepted: true } },
	});
	expect((await stat(target)).mode & 0o777).toBe(0o640);
	const before = await stat(target);
	await prepare(hostFor({}), fixture.home);
	expect((await stat(target)).mtimeMs).toBe(before.mtimeMs);
});

test("Claude can resume a trusted directory while a native process owns the config lock", async () => {
	const stateFile = join(fixture.home, ".claude.json");
	await writeFile(
		stateFile,
		JSON.stringify({ projects: { [await realpath(fixture.home)]: { hasTrustDialogAccepted: true } } }),
	);
	const release = await lock(stateFile, { lockfilePath: `${stateFile}.lock` });
	try {
		expect((await prepare(hostFor({}), fixture.home)).harness).toBe("claude");
	} finally {
		await release();
	}
}, 10000);
