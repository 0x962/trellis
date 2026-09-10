import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeStateFile, createFolderTrust, insideRoot, isTrusted, seedFolders } from "./trust.ts";

const store = async () => {
	const dir = await mkdtemp(join(tmpdir(), "trellis-trust-test-"));
	return { dir, file: join(dir, ".claude.json") };
};

const read = async (file: string) => JSON.parse(await readFile(file, "utf-8")) as Record<string, unknown>;

// Superset terminals on this machine carry CLAUDE_CONFIG_DIR, and Claude
// then reads its state next to that directory. A seed of the home file
// changes nothing for those terminals.
test("the state file follows CLAUDE_CONFIG_DIR and falls back to the home file", () => {
	expect(claudeStateFile({ CLAUDE_CONFIG_DIR: "/Users/navid/.claude-work" }, "/Users/navid")).toBe(
		"/Users/navid/.claude-work/.claude.json",
	);
	expect(claudeStateFile({}, "/Users/navid")).toBe("/Users/navid/.claude.json");
	expect(claudeStateFile({ CLAUDE_CONFIG_DIR: "" }, "/Users/navid")).toBe("/Users/navid/.claude.json");
});

// A root trusts itself and everything under it. A sibling whose name only
// starts with the root's name is a different folder.
test("a folder is inside a root when it is the root or sits under it", () => {
	expect(insideRoot("/a/b", "/a/b")).toBe(true);
	expect(insideRoot("/a/b/c/d", "/a/b")).toBe(true);
	expect(insideRoot("/a/bc", "/a/b")).toBe(false);
	expect(insideRoot("/a", "/a/b")).toBe(false);
	expect(isTrusted("/a/b/c", ["/x", "/a/b"])).toBe(true);
	expect(isTrusted("/a/b/c", [])).toBe(false);
});

test("a seed writes hasTrustDialogAccepted and keeps every other key", async () => {
	const { file } = await store();
	await writeFile(file, JSON.stringify({ userID: "u1", projects: { "/other": { allowedTools: ["Bash"] } } }));
	const trust = createFolderTrust(file);

	expect(await trust.trust("/repo")).toBe("seeded");

	const after = await read(file);
	expect(after).toEqual({
		userID: "u1",
		projects: { "/other": { allowedTools: ["Bash"] }, "/repo": { hasTrustDialogAccepted: true } },
	});
});

// Claude writes `false` into a fresh entry and never records a decline, so
// false is "never asked" and the seed replaces it.
test("a seed keeps the other keys of the folder's own entry and replaces a false flag", async () => {
	const { file } = await store();
	await writeFile(file, JSON.stringify({ projects: { "/repo": { hasTrustDialogAccepted: false, mcpServers: {} } } }));

	expect(await createFolderTrust(file).trust("/repo")).toBe("seeded");

	expect((await read(file)).projects).toEqual({ "/repo": { hasTrustDialogAccepted: true, mcpServers: {} } });
});

test("a folder the store already trusts is not written again", async () => {
	const { file } = await store();
	await writeFile(file, JSON.stringify({ projects: { "/repo": { hasTrustDialogAccepted: true } } }));
	const before = await readFile(file, "utf-8");

	expect(await createFolderTrust(file).trust("/repo")).toBe("already");

	expect(await readFile(file, "utf-8")).toBe(before);
});

// A missing config directory means this Claude was never set up. Its own
// first run asks about trust, so there is nothing to seed.
test("a missing config directory writes nothing", async () => {
	const { dir } = await store();
	const trust = createFolderTrust(join(dir, "never-made", ".claude.json"));
	expect(await trust.trust("/repo")).toBe("no-store");
});

test("a store file that is not there yet is created with the one folder", async () => {
	const { file } = await store();
	expect(await createFolderTrust(file).trust("/repo")).toBe("seeded");
	expect(await read(file)).toEqual({ projects: { "/repo": { hasTrustDialogAccepted: true } } });
});

// The trusted roots are the whole permission. A folder outside them is
// left alone, whatever else the caller asks for.
test("seedFolders seeds a folder inside a root and skips one outside every root", async () => {
	const { file } = await store();
	const trust = createFolderTrust(file);

	const report = await seedFolders(trust, ["/repo", "/repo/.worktrees/trl-5", "/elsewhere"], ["/repo"]);

	expect(report).toEqual({ seeded: ["/repo", "/repo/.worktrees/trl-5"], rootless: false });
	expect(Object.keys((await read(file)).projects as object)).toEqual(["/repo", "/repo/.worktrees/trl-5"]);
});

// A project with no trusted folder gives trellis no permission at all, and
// the session records that the agent meets the trust dialog.
test("seedFolders with no trusted root writes nothing and reports the project rootless", async () => {
	const { file } = await store();

	const report = await seedFolders(createFolderTrust(file), ["/repo"], []);

	expect(report).toEqual({ seeded: [], rootless: true });
	expect(await Bun.file(file).exists()).toBe(false);
});
