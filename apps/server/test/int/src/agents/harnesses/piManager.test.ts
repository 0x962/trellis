import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparePi } from "../../../../../src/agents/harnesses/pi/pi.ts";

test("Pi copilots expose native and Trellis tools", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-pi-manager-"));
	try {
		const bridge = join(directory, "bridge.mjs");
		await writeFile(
			bridge,
			`import {createInterface} from 'node:readline';
for await (const line of createInterface({input:process.stdin})) {
 const message=JSON.parse(line); if(message.id === undefined) continue;
 const result=message.method === 'initialize' ? {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'test',version:'1'}} : message.method === 'tools/list' ? {tools:[{name:'trellis_tickets_list',description:'List tickets',inputSchema:{type:'object',properties:{project:{type:'string'}},required:['project']}}]} : {isError:message.params.arguments.project === 'denied',content:[{type:'text',text:JSON.stringify(message.params)}]};
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result})+'\\n');
}`,
		);
		const launch = await preparePi({
			cwd: directory,
			configDirectory: directory,
			prompt: "Manage tickets",
			resume: false,
			hookCommand: "/usr/bin/true",
			managerSystemPrompt: `Database persona ${crypto.randomUUID()}`,
			managerTools: { command: process.execPath, args: [bridge] },
		});
		expect(launch.args).not.toContain("--no-builtin-tools");
		expect(launch.args).toContain("--no-extensions");
		expect(launch.args).toContain("--no-skills");
		expect(launch.args).toContain("read,bash,edit,write,grep,find,ls");
		const extension = await import(join(directory, "trellis-pi.mjs"));
		const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
		const tools: {
			name: string;
			parameters: unknown;
			execute: (id: string, args: unknown) => Promise<{ content: { text: string }[] }>;
		}[] = [];
		let active: string[] = ["read", "bash"];
		await extension.default({
			on: (name: string, handler: (...args: unknown[]) => unknown) =>
				handlers.set(name, [...(handlers.get(name) ?? []), handler]),
			registerTool: (tool: (typeof tools)[number]) => tools.push(tool),
			getActiveTools: () => active,
			setActiveTools: (names: string[]) => {
				active = names;
			},
		});
		try {
			for (const handler of handlers.get("session_start")!)
				await handler({}, { sessionManager: { getSessionId: () => "session" } });
			expect(active).toEqual(["read", "bash", "trellis_tickets_list"]);
			expect(tools.map((tool) => tool.name)).toEqual(["trellis_tickets_list"]);
			expect(tools[0]!.parameters).toMatchObject({ type: "object", required: ["project"] });
			const result = await tools[0]!.execute("call", { project: "TRL; echo bad" });
			expect(JSON.parse(result.content[0]!.text)).toEqual({
				name: "trellis_tickets_list",
				arguments: { project: "TRL; echo bad" },
			});
			await expect(tools[0]!.execute("denied", { project: "denied" })).rejects.toThrow("denied");
			expect(handlers.get("tool_call")).toBeUndefined();
		} finally {
			for (const handler of handlers.get("session_shutdown") ?? []) await handler();
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("Pi manager setup fails if the tool bridge cannot start", async () => {
	const directory = await mkdtemp(join(tmpdir(), "trellis-pi-manager-failed-"));
	try {
		await preparePi({
			cwd: directory,
			configDirectory: directory,
			prompt: "Manage tickets",
			resume: false,
			hookCommand: "/usr/bin/true",
			managerSystemPrompt: `Database persona ${crypto.randomUUID()}`,
			managerTools: { command: join(directory, "missing-bridge"), args: [] },
		});
		const extension = await import(join(directory, "trellis-pi.mjs"));
		await expect(
			extension.default({
				on: () => {},
				registerTool: () => {
					throw new Error("No tool must register");
				},
			}),
		).rejects.toThrow("ENOENT");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
