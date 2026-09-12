import { z } from "zod";

const projectsSchema = z.array(z.object({ id: z.string(), repo: z.string().nullable().optional() }));
const workspaceSchema = z.object({
	workspace: z.object({ id: z.string() }),
	terminals: z.array(z.object({ terminalId: z.string(), label: z.string() })),
});
const workspacesSchema = z.array(z.object({ id: z.string(), branch: z.string() }));
// Superset 1.28 prints `online` as "yes", "no", or "local". An older or a
// newer build may print a boolean.
const hostsSchema = z.array(z.object({ id: z.string(), name: z.string(), online: z.union([z.boolean(), z.string()]) }));
const terminalSchema = z.object({ terminalId: z.string() });
const terminalsSchema = z.object({
	sessions: z.array(z.object({ terminalId: z.string(), exited: z.boolean(), title: z.string() })),
});
// The `ws create` flag pair that names where the workspace goes, already
// quoted for the shell. The launch command template carries it as
// `{{target}}`.
export const shellTarget = (host: string | null) =>
	host === null ? "--local" : `--host '${host.replaceAll("'", "'\\''")}'`;

// `host` names the Superset machine the agents of one project run on. Null
// runs terminal commands on the machine that runs the trellis server.
export const superset = (bin: string, host: string | null = null) => {
	const on = host === null ? [] : ["--host", host];
	const call = async (args: string[]) => {
		const child = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
		const [output, error, exit] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (exit !== 0) throw new Error(error.trim() || `Superset exits with code ${exit}.`);
		return output.trim();
	};
	return {
		hostDetails: async () => hostsSchema.parse(JSON.parse(await call(["hosts", "list", "--json"]))),
		hasWorkspace: async (id: string) =>
			workspacesSchema
				.parse(JSON.parse(await call(["ws", "list", "--json", ...on])))
				.some((workspace) => workspace.id === id),
		projects: async () => projectsSchema.parse(JSON.parse(await call(["projects", "list", "--json", ...on]))),
		// The machines Superset can reach. `online` is "yes" or "local" for a
		// machine that answers now; "local" names the machine that runs
		// Superset itself.
		hosts: async () =>
			hostsSchema.parse(JSON.parse(await call(["hosts", "list", "--json"]))).map(({ id, name, online }) => ({
				id,
				name,
				online: online === true || online === "yes" || online === "local",
			})),
		create: async (command: string) => {
			const child = Bun.spawn(["/bin/zsh", "-lc", command], { stdout: "pipe", stderr: "pipe" });
			const [output, error, exit] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			if (exit !== 0) throw new Error(error.trim() || `The launch command exits with code ${exit}.`);
			const result = workspaceSchema.parse(JSON.parse(output));
			const terminal = result.terminals.find((item) => item.label === "Command");
			if (!terminal) throw new Error(`Superset workspace ${result.workspace.id} has no command terminal.`);
			return { workspaceId: result.workspace.id, terminalId: terminal.terminalId };
		},
		// Open one more terminal in a workspace that already exists. A manager
		// that starts again takes this, so its workspace and the chat inside
		// it hold across every stop.
		terminal: async (workspaceId: string, command: string) => {
			const created = terminalSchema.parse(
				JSON.parse(
					await call(["terminals", "create", ...on, "--workspace", workspaceId, "--command", command, "--json"]),
				),
			);
			return { workspaceId, terminalId: created.terminalId };
		},
		send: (workspaceId: string, terminalId: string, text: string) =>
			call(["terminals", "send", ...on, "--workspace", workspaceId, "--terminal", terminalId, "--text", text]),
		output: (workspaceId: string, terminalId: string) =>
			call(["terminals", "read", ...on, "--workspace", workspaceId, "--terminal", terminalId, "--max-lines", "200"]),
		url: (workspaceId: string) => call(["ws", "open", workspaceId, "--print", ...on]),
		stop: (workspaceId: string, terminalId: string) =>
			call(["terminals", "close", ...on, "--workspace", workspaceId, "--terminal", terminalId]),
		recover: async (branch: string, name: string) => {
			const workspaces = workspacesSchema.parse(JSON.parse(await call(["ws", "list", "--json", ...on])));
			const workspace = workspaces.find((item) => item.branch === branch);
			if (!workspace)
				throw new Error("The startup result is unknown. Check Superset before you release this assignment.");
			const result = terminalsSchema.parse(
				JSON.parse(await call(["terminals", "list", ...on, "--workspace", workspace.id, "--json"])),
			);
			const terminal = result.sessions.find(
				(item) => item.title === "Command" || item.title === "Agent" || item.title.includes(name),
			);
			if (!terminal)
				throw new Error(`Check workspace ${workspace.id} in Superset. Its command terminal could not be identified.`);
			return { workspaceId: workspace.id, terminalId: terminal.terminalId, exited: terminal.exited };
		},
		exited: async (workspaceId: string, terminalId: string) => {
			const result = terminalsSchema.parse(
				JSON.parse(await call(["terminals", "list", ...on, "--workspace", workspaceId, "--json"])),
			);
			return result.sessions.find((item) => item.terminalId === terminalId)?.exited ?? true;
		},
	};
};
