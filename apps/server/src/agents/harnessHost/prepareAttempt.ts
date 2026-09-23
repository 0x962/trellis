import { randomUUID } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESS_DEFAULT_MODELS, toHarnessModel } from "@trellis/api";
import { checkMuseVersion } from "./checkMuseVersion.ts";
import { checkOpenCodeVersion } from "./checkOpenCodeVersion.ts";
import { claudeTrust } from "./claudeTrust.ts";
import { providers } from "./providers.ts";
import { resolveExecutable } from "./resolveExecutable.ts";
import type { HarnessDescriptor, HarnessHostOptions, HarnessStartInput } from "./types.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export async function prepareAttempt(
	options: HarnessHostOptions,
	input: HarnessStartInput,
	sessionId?: string,
): Promise<HarnessDescriptor> {
	const directory = join(options.directory, input.id);
	const model = input.model ?? (sessionId === undefined ? HARNESS_DEFAULT_MODELS[input.harness] : undefined);
	const env = Object.fromEntries(
		Object.entries(options.env)
			.filter((entry): entry is [string, string] => entry[1] !== undefined)
			.sort(([a], [b]) => a.localeCompare(b)),
	);
	const fingerprint = JSON.stringify([
		input.harness,
		input.cwd,
		input.prompt,
		model ?? null,
		...(input.effort === undefined ? [] : [{ effort: input.effort }]),
		input.token ?? null,
		input.timeoutMs ?? null,
		sessionId ?? null,
		env,
		options.bun,
		options.runtime.socketPath,
	]);
	const path = join(directory, "launch.json");
	const verify = (record: HarnessDescriptor) => {
		if (record.fingerprint !== fingerprint)
			throw new Error(`Harness attempt ${input.id} already has a different launch request`);
		return record;
	};
	try {
		return verify(JSON.parse(await readFile(path, "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const executable = await resolveExecutable(input.harness, env.PATH ?? "");
	if (input.harness === "opencode") await checkOpenCodeVersion(executable, input.cwd, env);
	if (input.harness === "muse") await checkMuseVersion(executable, input.cwd, env);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const hookCommand = `${quote(options.bun)} ${quote(fileURLToPath(new URL("./hook.ts", import.meta.url)))}`;
	const configDirectory = await mkdtemp(join(directory, "config-"));
	const cwd = input.cwd;
	if (input.harness === "claude") await claudeTrust(cwd, env, options.agentsDirectory, options.log);
	const common = {
		env,
		cwd,
		prompt: `trellis-message:${input.id}\n${input.prompt}`,
		model: model === undefined ? undefined : toHarnessModel(input.harness, model),
		effort: input.effort,
		configDirectory,
		hookCommand,
	};
	const launch = await providers[input.harness].prepare(
		sessionId === undefined ? { ...common, resume: false } : { ...common, resume: true, sessionId },
	);
	const descriptor: HarnessDescriptor = {
		harness: input.harness,
		prompt: input.prompt,
		sessionId,
		fingerprint,
		...(input.effort === undefined ? {} : { effort: input.effort }),
		spec: {
			id: input.id,
			command:
				input.harness === "codex" || input.harness === "muse"
					? launch.executable.startsWith("/")
						? launch.executable
						: await resolveExecutable(launch.executable, env.PATH ?? "")
					: executable,
			args: launch.args,
			cwd,
			mode: "pty",
			timeoutMs: input.timeoutMs,
			env: {
				...env,
				...launch.env,
				...(input.harness === "codex" ? { TRELLIS_CODEX_EXECUTABLE: executable } : {}),
				...(input.harness === "muse" ? { TRELLIS_MUSE_EXECUTABLE: executable } : {}),
				TRELLIS_HARNESS: input.harness,
				TRELLIS_HARNESS_SOCKET: options.runtime.socketPath,
				TRELLIS_HARNESS_HOOK: hookCommand,
				TRELLIS_ATTEMPT_ID: input.id,
				TRELLIS_ATTEMPT_TOKEN: input.token ?? randomUUID(),
			},
		},
	};
	const temporary = join(directory, `launch-${randomUUID()}.tmp`);
	await writeFile(temporary, JSON.stringify(descriptor), { flag: "wx", mode: 0o600 });
	try {
		await link(temporary, path);
		return descriptor;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		await rm(configDirectory, { recursive: true, force: true });
		return verify(JSON.parse(await readFile(path, "utf8")));
	} finally {
		await unlink(temporary);
	}
}
