import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { apiUrl } from "./env";

const entry = fileURLToPath(new URL("../../../packages/cli/src/index.ts", import.meta.url));

// Runs the real CLI against the test server and parses its JSON output. The
// URL is always explicit, so a TRELLIS_URL in the shell never reaches the
// live server. A non-zero exit throws with the CLI's stderr.
export const trellis = <T>(args: string[], actor = "agent:claude-code"): T => {
	const stdout = execFileSync("bun", [entry, "--url", apiUrl, "--as", actor, "--json", ...args], {
		encoding: "utf8",
	});
	return JSON.parse(stdout) as T;
};

export type CliTicket = { identifier: string; updatedAt: string; version: number; status: { name: string } };

export type CliProject = { key: string };

// Creates a root project unless one with that key exists. A failed spec
// restarts its worker and runs `beforeAll` again, so a seed must not fail
// on its own earlier run.
export const ensureProject = (key: string, name: string) => {
	const projects = trellis<CliProject[]>(["projects", "list"]);
	if (projects.some((project) => project.key === key)) return false;
	trellis(["projects", "create", "--key", key, "--name", name]);
	return true;
};

export const createTicket = (project: string, title: string, extra: string[] = []) =>
	trellis<CliTicket>(["create", "-p", project, "-t", title, ...extra]);

export const moveTicket = (ticket: string, status: string, actor?: string) =>
	trellis<CliTicket>(["move", ticket, status], actor);

// Runs a command line as a person pastes it into a shell. The `trellis` on
// the PATH is a script in the temp root that runs the real CLI against the
// test server with JSON output.
export const runPasted = <T>(command: string): T => {
	const bin = join(process.env.TRELLIS_E2E_ROOT!, "bin");
	mkdirSync(bin, { recursive: true });
	writeFileSync(
		join(bin, "trellis"),
		`#!/bin/sh\nexec bun "${entry}" --url "${apiUrl}" --as human:dana --json "$@"\n`,
		{ mode: 0o755 },
	);
	const stdout = execFileSync("sh", ["-c", command], {
		encoding: "utf8",
		env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
	});
	return JSON.parse(stdout) as T;
};
