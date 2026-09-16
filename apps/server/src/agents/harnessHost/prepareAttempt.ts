import { randomUUID } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCodexManagerVersion } from "./checkCodexManagerVersion/checkCodexManagerVersion.ts";
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
	const env = Object.fromEntries(
		Object.entries(options.env)
			.filter((entry): entry is [string, string] => entry[1] !== undefined)
			.sort(([a], [b]) => a.localeCompare(b)),
	);
	const fingerprint = JSON.stringify([
		input.harness,
		input.cwd,
		input.prompt,
		input.model ?? null,
		input.token ?? null,
		input.timeoutMs ?? null,
		...(input.kind === "manager" ? ["manager-tools-v1", input.managerId ?? input.id, input.managerSystemPrompt] : []),
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
	if (input.harness === "codex" && input.kind === "manager") await checkCodexManagerVersion(executable, input.cwd, env);
	if (input.harness === "opencode") await checkOpenCodeVersion(executable, input.cwd, env);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const hookCommand = `${quote(options.bun)} ${quote(fileURLToPath(new URL("./hook.ts", import.meta.url)))}`;
	const configDirectory = await mkdtemp(join(directory, "config-"));
	const cwd =
		input.kind === "manager" && sessionId === undefined
			? join(options.directory, "manager-workspaces", input.managerId ?? input.id)
			: input.cwd;
	if (input.kind === "manager" && sessionId === undefined) await mkdir(cwd, { recursive: true, mode: 0o700 });
	if (input.harness === "claude") await claudeTrust(cwd, env);
	const common = {
		env,
		cwd,
		prompt: `trellis-message:${input.id}\n${input.prompt}`,
		model: input.model,
		configDirectory,
		hookCommand,
		...(input.kind === "manager"
			? {
					managerSystemPrompt: input.managerSystemPrompt,
					managerTools: {
						command: options.bun,
						args: [fileURLToPath(new URL("../managerTools/entry.ts", import.meta.url))],
					},
				}
			: { managerTools: undefined, managerSystemPrompt: undefined }),
	};
	const launch = await providers[input.harness].prepare(
		sessionId === undefined ? { ...common, resume: false } : { ...common, resume: true, sessionId },
	);
	const descriptor: HarnessDescriptor = {
		harness: input.harness,
		prompt: input.prompt,
		sessionId,
		fingerprint,
		spec: {
			id: input.id,
			command:
				input.harness === "codex"
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
