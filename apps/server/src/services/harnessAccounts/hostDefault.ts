import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AccountHarness } from "@trellis/api";
import { profileDefault } from "./profiles.ts";

// The machine-wide default login of a harness, the way SuperSet keeps it.
//
// SuperSet publishes one pointer file per harness under
// `~/.superset/state/`: `default-claude-config-dir` and `default-codex-home`.
// The file holds the profile directory that a new agent launch must use, or
// nothing for the plain login at `~/.claude` or `~/.codex`. Every tool on
// the machine reads the file again at each launch, so a switch in one tool
// reaches the next launch in every other. Trellis reads the same file, and
// writes it when a person picks a default here, so the two tools agree.
//
// A pointer whose directory is gone counts as the plain login: a launch on
// the plain login beats a launch that is signed out.

const POINTER_NAMES: Partial<Record<AccountHarness, string>> = {
	claude: "default-claude-config-dir",
	codex: "default-codex-home",
};

export const supersetHome = (env: NodeJS.ProcessEnv) =>
	env.SUPERSET_HOME_DIR?.trim() || join(env.HOME ?? homedir(), ".superset");

const pointerPath = (harness: AccountHarness, env: NodeJS.ProcessEnv) => {
	const name = POINTER_NAMES[harness];
	return name === undefined ? null : join(supersetHome(env), "state", name);
};

export type HostDefault = {
	// True when the pointer file exists, also when it is empty.
	exists: boolean;
	// The profile directory the pointer names, or null for the plain login.
	profilePath: string | null;
};

export async function readHostDefault(harness: AccountHarness, env: NodeJS.ProcessEnv): Promise<HostDefault> {
	const path = pointerPath(harness, env);
	if (path === null) return { exists: false, profilePath: null };
	let value: string;
	try {
		value = (await readFile(path, "utf8")).trim();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, profilePath: null };
		throw error;
	}
	return { exists: true, profilePath: value && existsSync(value) ? value : null };
}

// Writes the pointer the way SuperSet does: a temporary file, then one
// rename, so a reader never sees a half-written path. An empty value means
// the plain login. The write happens only where SuperSet keeps its state,
// so a machine without SuperSet gets no `~/.superset` directory.
export async function writeHostDefault(
	harness: AccountHarness,
	profilePath: string | null,
	env: NodeJS.ProcessEnv,
): Promise<void> {
	const path = pointerPath(harness, env);
	if (path === null || !existsSync(supersetHome(env))) return;
	await mkdir(join(supersetHome(env), "state"), { recursive: true });
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporary, profilePath ?? "");
	await rename(temporary, path);
}

export type DefaultCandidate = { harness: AccountHarness; profilePath: string; isDefault: boolean };

export type ResolvedDefault<T extends DefaultCandidate> = {
	// The profile directory a new launch uses.
	profilePath: string;
	// The Trellis account whose profile that is, when one exists.
	account: T | null;
	// Where the choice comes from: the SuperSet pointer, the Trellis default
	// flag, or the plain login of the harness.
	source: "superset" | "trellis" | "system";
};

const canonical = (path: string) => realpath(path).catch(() => path);

// The default login of a harness among `accounts`. The SuperSet pointer
// wins when its file exists. Otherwise the account with the Trellis
// default flag wins. Otherwise the plain login of the harness is the
// default, and the account that names that directory, if any, is its
// account.
export async function resolveHostDefault<T extends DefaultCandidate>(
	harness: AccountHarness,
	accounts: readonly T[],
	env: NodeJS.ProcessEnv,
): Promise<ResolvedDefault<T>> {
	const candidates = accounts.filter((account) => account.harness === harness);
	const pointer = await readHostDefault(harness, env);
	const flagged = candidates.find((account) => account.isDefault);
	if (!pointer.exists && flagged) return { profilePath: flagged.profilePath, account: flagged, source: "trellis" };
	const profilePath = pointer.profilePath ?? profileDefault(harness, env);
	const target = await canonical(profilePath);
	let account: T | null = null;
	for (const candidate of candidates) {
		if ((await canonical(candidate.profilePath)) === target) {
			account = candidate;
			break;
		}
	}
	return { profilePath, account, source: pointer.exists ? "superset" : "system" };
}
