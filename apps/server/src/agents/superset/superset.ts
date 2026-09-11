import { z } from "zod";

const projectsSchema = z.array(z.object({ id: z.string(), repo: z.string().nullable().optional() }));
const workspaceSchema = z.object({
	workspace: z.object({ id: z.string() }),
	terminals: z.array(z.object({ terminalId: z.string(), label: z.string() })),
});
const workspacesSchema = z.array(z.object({ id: z.string(), branch: z.string() }));
const terminalsSchema = z.object({
	sessions: z.array(z.object({ terminalId: z.string(), exited: z.boolean(), title: z.string() })),
});
export const superset = (bin: string) => {
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
		projects: async () => projectsSchema.parse(JSON.parse(await call(["projects", "list", "--json"]))),
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
		send: (workspaceId: string, terminalId: string, text: string) =>
			call(["terminals", "send", "--workspace", workspaceId, "--terminal", terminalId, "--text", text]),
		output: (workspaceId: string, terminalId: string) =>
			call(["terminals", "read", "--workspace", workspaceId, "--terminal", terminalId, "--max-lines", "200"]),
		url: (workspaceId: string) => call(["ws", "open", workspaceId, "--print"]),
		stop: (workspaceId: string, terminalId: string) =>
			call(["terminals", "close", "--workspace", workspaceId, "--terminal", terminalId]),
		recover: async (branch: string, name: string) => {
			const workspaces = workspacesSchema.parse(JSON.parse(await call(["ws", "list", "--json"])));
			const workspace = workspaces.find((item) => item.branch === branch);
			if (!workspace)
				throw new Error("The startup result is unknown. Check Superset before you release this assignment.");
			const result = terminalsSchema.parse(
				JSON.parse(await call(["terminals", "list", "--workspace", workspace.id, "--json"])),
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
				JSON.parse(await call(["terminals", "list", "--workspace", workspaceId, "--json"])),
			);
			return result.sessions.find((item) => item.terminalId === terminalId)?.exited ?? true;
		},
	};
};
