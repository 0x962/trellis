import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export const managedTerminal = (home: string) => {
	const socket = join(tmpdir(), `trl-${createHash("sha256").update(home).digest("hex").slice(0, 12)}.sock`);
	const call = async (args: string[], input?: string) => {
		const child = Bun.spawn(["tmux", "-S", socket, "-f", "/dev/null", ...args], {
			stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [output, error, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (code !== 0) throw new Error(error.trim() || `tmux exits with code ${code}.`);
		return output;
	};
	return {
		start: async (id: string, command: string, workDir: string, env: { url: string; actor: string }) => {
			await mkdir(workDir, { recursive: true, mode: 0o700 });
			const script = join(home, "agents", id, "launch.sh");
			await mkdir(dirname(script), { recursive: true, mode: 0o700 });
			await writeFile(
				script,
				`#!/bin/zsh\nexport TRELLIS_URL=${quote(env.url)}\nexport TRELLIS_ACTOR=${quote(env.actor)}\n${command}\n`,
				{ mode: 0o700 },
			);
			await call([
				"new-session",
				"-d",
				"-s",
				id,
				"-c",
				workDir,
				";",
				"set-option",
				"-t",
				id,
				"remain-on-exit",
				"on",
				";",
				"respawn-pane",
				"-k",
				"-t",
				id,
				`exec /bin/zsh ${quote(script)}`,
			]);
			return { workspaceId: workDir, terminalId: id };
		},
		exited: async (id: string) => (await call(["display-message", "-p", "-t", id, "#{pane_dead}"])).trim() === "1",
		stop: (id: string) => call(["kill-session", "-t", id]),
		send: async (id: string, text: string) => {
			await call(["load-buffer", "-b", id, "-"], text);
			await call(["paste-buffer", "-d", "-b", id, "-t", id, ";", "send-keys", "-t", id, "Enter"]);
		},
		output: (id: string) => call(["capture-pane", "-p", "-t", id, "-S", "-200"]),
	};
};
