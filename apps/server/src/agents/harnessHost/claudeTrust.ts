import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { lock } from "proper-lockfile";

type NativeState = {
	hasCompletedOnboarding?: boolean;
	projects?: Record<string, { hasTrustDialogAccepted?: boolean; [key: string]: unknown }>;
	[key: string]: unknown;
};

// True when a launch in `cwd` needs no answer from a person: the directory
// is trusted and the first-run questions are done.
const ready = (state: NativeState, directory: string) =>
	state.hasCompletedOnboarding === true && state.projects?.[directory]?.hasTrustDialogAccepted === true;

// Marks `cwd` as trusted and the first-run setup as complete in the state
// file of the Claude profile that `env` selects. A launched Claude receives
// its prompt as an argument, so a trust question or the first-run theme
// question would hold the process forever with no one to answer it.
export async function claudeTrust(cwd: string, env: Record<string, string>) {
	const home = env.HOME ?? homedir();
	const configDirectory = resolve(cwd, env.CLAUDE_CONFIG_DIR || join(home, ".claude"));
	const legacy = join(configDirectory, ".config.json");
	const suffix = env.CLAUDE_CODE_CUSTOM_OAUTH_URL ? "-custom-oauth" : "";
	const statePath = existsSync(legacy) ? legacy : resolve(cwd, env.CLAUDE_CONFIG_DIR || home, `.claude${suffix}.json`);
	const canonicalDirectory = (await realpath(cwd)).normalize("NFC");
	if (existsSync(statePath)) {
		const state: NativeState = JSON.parse(await readFile(statePath, "utf8"));
		if (ready(state, canonicalDirectory)) return;
	}
	await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
	const release = await lock(statePath, {
		lockfilePath: `${statePath}.lock`,
		realpath: false,
		retries: { retries: 80, minTimeout: 25, maxTimeout: 250 },
	});
	let temporary: string | undefined;
	try {
		const exists = existsSync(statePath);
		const file = exists ? await realpath(statePath) : statePath;
		const state: NativeState = exists ? JSON.parse(await readFile(file, "utf8")) : {};
		if (ready(state, canonicalDirectory)) return;
		const project = state.projects?.[canonicalDirectory];
		state.hasCompletedOnboarding = true;
		state.projects = { ...state.projects, [canonicalDirectory]: { ...project, hasTrustDialogAccepted: true } };
		const mode = exists ? (await stat(file)).mode & 0o777 : 0o600;
		temporary = join(dirname(file), `.trellis-claude-trust-${randomUUID()}`);
		await writeFile(temporary, JSON.stringify(state, null, 2), { flag: "wx", mode });
		await chmod(temporary, mode);
		await rename(temporary, file);
	} finally {
		try {
			if (temporary) await rm(temporary, { force: true });
		} finally {
			await release();
		}
	}
}
