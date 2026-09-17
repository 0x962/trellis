import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type { AccountHarness } from "@trellis/api";
import { z } from "zod";

const exec = promisify(execFile);
type Input = {
	harness: AccountHarness;
	from: string;
	to: string;
	sessionId: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
	directory: string;
};
export async function transferSession(input: Input) {
	const { harness, from, to, sessionId } = input;
	z.string()
		.regex(/^[a-zA-Z0-9_-]+$/)
		.parse(sessionId);
	if ((await realpath(from)) === (await realpath(to))) return;
	if (harness === "opencode") {
		const exported = await exec("opencode", ["export", sessionId], {
			cwd: input.cwd,
			env: { ...input.env, XDG_DATA_HOME: from },
			maxBuffer: 64 * 1024 * 1024,
			timeout: 30000,
		});
		const data = z
			.object({ info: z.object({ id: z.string() }), messages: z.array(z.unknown()) })
			.parse(JSON.parse(exported.stdout));
		if (data.info.id !== sessionId) throw new Error("OpenCode exported a different session.");
		await mkdir(input.directory, { recursive: true, mode: 0o700 });
		const path = join(input.directory, "session.json");
		await writeFile(path, exported.stdout, { mode: 0o600 });
		const imported = await exec("opencode", ["import", path], {
			cwd: input.cwd,
			env: { ...input.env, XDG_DATA_HOME: to },
			maxBuffer: 1024 * 1024,
			timeout: 30000,
		});
		if (!imported.stdout.includes(`Imported session: ${sessionId}`))
			throw new Error("OpenCode did not confirm the imported session.");
		return;
	}
	if (harness === "muse") {
		// A Muse session is one directory under `muse/sessions/<date>/<id>/`
		// that holds `session.jsonl` and its sidecar files. The resumed host
		// reads the copied directory without the session index of the source.
		const candidates = await Array.fromAsync(
			new Bun.Glob(`muse/sessions/**/${sessionId}/session.jsonl`).scan({ cwd: from, followSymlinks: true }),
		);
		if (candidates.length !== 1)
			throw new Error(`Cannot identify one saved muse session ${sessionId} in its account profile.`);
		const relative = dirname(candidates[0]!);
		const source = join(from, relative),
			target = join(to, relative);
		if (existsSync(target) && (await realpath(source)) === (await realpath(target))) return;
		await mkdir(dirname(target), { recursive: true, mode: 0o700 });
		await cp(source, target, { recursive: true });
		return;
	}
	const pattern = harness === "claude" ? "projects/*/*.jsonl" : "sessions/**/*.jsonl";
	const candidates = await Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: from, followSymlinks: true }));
	const matches = candidates.filter((path) => {
		const name = basename(path);
		return harness === "claude"
			? name === `${sessionId}.jsonl`
			: harness === "codex"
				? name.endsWith(`-${sessionId}.jsonl`)
				: name.endsWith(`_${sessionId}.jsonl`);
	});
	if (matches.length !== 1)
		throw new Error(`Cannot identify one saved ${harness} session ${sessionId} in its account profile.`);
	const relative = matches[0]!;
	const source = join(from, relative),
		target = join(to, relative);
	if (existsSync(target) && (await realpath(source)) === (await realpath(target))) return;
	await mkdir(dirname(target), { recursive: true, mode: 0o700 });
	const temporary = `${target}.trellis-transfer`;
	await writeFile(temporary, await readFile(source), { mode: 0o600 });
	await rename(temporary, target);
	if (harness === "claude") {
		const children = join(dirname(source), sessionId);
		if (existsSync(children)) await cp(children, join(dirname(target), sessionId), { recursive: true });
	}
}
