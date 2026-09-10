import { existsSync, realpathSync } from "node:fs";
import { chmod, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// The folder trust of the agent command line. Claude asks "do you trust
// this folder?" the first time it runs in a folder and waits for an
// answer, so an agent trellis starts in an unknown folder never runs. The
// escape hatch Claude documents is the key
// `projects[<folder>].hasTrustDialogAccepted` in its state file, and this
// module writes it before an agent starts.
//
// trellis writes the key only for a folder inside one of the trusted roots
// of the project, which a human keeps in the project settings. Every other
// folder stays untrusted, and the session records why it cannot run.

// The state file Claude reads. `CLAUDE_CONFIG_DIR` moves the whole Claude
// state, so the launching environment decides the file; without it Claude
// reads `.claude.json` in the home directory.
export const claudeStateFile = (env: Record<string, string | undefined> = process.env, home = homedir()) =>
	env.CLAUDE_CONFIG_DIR === undefined || env.CLAUDE_CONFIG_DIR === ""
		? join(home, ".claude.json")
		: join(env.CLAUDE_CONFIG_DIR, ".claude.json");

// Claude stores a folder under the path with every symbolic link resolved.
// A folder that is not there yet keeps the absolute form of its name.
export const normalizeFolder = (folder: string) => {
	if (!existsSync(folder)) return resolve(folder);
	return realpathSync(folder);
};

// True when `folder` is `root` itself or sits under it. The comparison adds
// the separator, so `/a/bc` is outside the root `/a/b`.
export const insideRoot = (folder: string, root: string) => folder === root || folder.startsWith(`${root}/`);

export const isTrusted = (folder: string, roots: string[]) =>
	roots.some((root) => insideRoot(normalizeFolder(folder), normalizeFolder(root)));

// What one seed did. `seeded`: the key went into the store. `already`: the
// store already trusted the folder. `no-store`: the Claude config directory
// is not there, so Claude runs its own first-run setup, which asks about
// trust anyway.
export type SeedResult = "seeded" | "already" | "no-store";

export type FolderTrust = {
	file: string;
	trust: (folder: string) => Promise<SeedResult>;
};

// A write to a temporary file in the same directory, then a rename, so a
// crash never leaves half a state file. The replacement keeps the mode the
// store has, because the store sits beside credentials.
const atomicWrite = async (file: string, content: string) => {
	const mode = await stat(file).then(
		(info) => info.mode & 0o777,
		() => 0o600,
	);
	const dir = await mkdtemp(join(dirname(file), ".trellis-trust-"));
	const next = join(dir, "next");
	await writeFile(next, content);
	await chmod(next, mode);
	await rename(next, file);
	await rm(dir, { recursive: true, force: true });
};

// The trust store at `file`. A test passes a file under its own temporary
// directory, so no test writes the real store.
export const createFolderTrust = (file: string): FolderTrust => ({
	file,
	trust: async (folder) => {
		if (!existsSync(file) && !existsSync(dirname(file))) return "no-store";
		const state = existsSync(file) ? ((await readFile(file, "utf-8")) as string) : "{}";
		const parsed = JSON.parse(state) as Record<string, unknown>;
		const projects = (parsed.projects ?? {}) as Record<string, Record<string, unknown> | undefined>;
		const key = normalizeFolder(folder);
		const entry = projects[key];
		// Claude writes `false` into a fresh entry and records no decline, so
		// false to true is the seed this module is for.
		if (entry?.hasTrustDialogAccepted === true) return "already";
		parsed.projects = { ...projects, [key]: { ...entry, hasTrustDialogAccepted: true } };
		await atomicWrite(file, JSON.stringify(parsed, null, 2));
		return "seeded";
	},
});

// What a seed of the folders of one agent left behind. `rootless` is true
// when the project lists no trusted folder at all: trellis then writes
// nothing, and the agent meets the trust dialog.
export type SeedReport = { seeded: string[]; rootless: boolean };

// Seeds each folder that sits inside a trusted root and skips the rest.
// The order of `folders` is the order of the report.
export const seedFolders = async (trust: FolderTrust, folders: string[], roots: string[]): Promise<SeedReport> => {
	const report: SeedReport = { seeded: [], rootless: roots.length === 0 };
	for (const folder of folders) {
		if (!isTrusted(folder, roots)) continue;
		if ((await trust.trust(folder)) === "seeded") report.seeded.push(folder);
	}
	return report;
};
