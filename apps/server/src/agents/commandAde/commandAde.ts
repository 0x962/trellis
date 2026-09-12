import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type AdeCommands, AdeHealthSchema, AdePlaceSchema, AdeProjectsSchema, type AgentRun } from "@trellis/api";
import { expandLaunchTemplate } from "../launchCommand/template.ts";

export type AdeSnapshot = { commands: AdeCommands; values: Record<string, string>; agentCommand: string };

export const executeAdeCommand = async (template: string, values: Record<string, string>) => {
	const child = Bun.spawn(["/bin/zsh", "-c", `set -e -o pipefail\n${expandLaunchTemplate(template, values)}`], {
		cwd: values.runDir,
		env: { ...process.env, TRELLIS_URL: values.trellisUrl, TRELLIS_ACTOR: values.actor },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [output, error, exit] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exit !== 0) throw new Error(error.trim() || `The ADE command exits with code ${exit}.`);
	return output;
};

// Each run keeps its command templates and launch values. A project edit
// cannot send a command from another ADE to an agent that already runs.
export const saveAde = async (home: string, id: string, snapshot: AdeSnapshot) => {
	const directory = join(home, "agents", id);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await writeFile(join(directory, "harness.json"), JSON.stringify(snapshot), { mode: 0o600 });
};

export const readAde = async (home: string, id: string): Promise<AdeSnapshot> =>
	JSON.parse(await readFile(join(home, "agents", id, "harness.json"), "utf8"));

export const commandAde = async (home: string, run: AgentRun) => {
	const snapshot = await readAde(home, run.id);
	const values = { ...snapshot.values, workspaceId: run.workspaceId ?? "", terminalId: run.terminalId ?? "" };
	const call = (operation: keyof AdeCommands, extra: Record<string, string> = {}) =>
		executeAdeCommand(snapshot.commands[operation], { ...values, ...extra });
	return {
		start: async (resume: boolean) => AdePlaceSchema.parse(JSON.parse(await call(resume ? "resume" : "start"))),
		recover: async () => AdePlaceSchema.parse(JSON.parse(await call("recover"))),
		healthcheck: async () => AdeHealthSchema.parse(JSON.parse(await call("healthcheck"))),
		projects: async () => AdeProjectsSchema.parse(JSON.parse(await call("projects"))),
		send: (text: string) => call("send", { text }),
		output: () => call("output"),
		stop: () => call("stop"),
		url: async () => (await call("open")).trim() || null,
	};
};
