import { afterEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTrellisClient } from "@trellis/api";
import { freshHome } from "../../../../helpers/home.ts";
import { type SpawnedServer, spawnServer, stopServer } from "../../../../helpers/server.ts";

const servers: SpawnedServer[] = [];
const homes: string[] = [];
const token = "controller-process-test";
afterEach(async () => {
	for (const server of servers.splice(0)) await stopServer(server);
	for (const home of homes.splice(0)) {
		if (!existsSync(join(home, "sends.jsonl"))) continue;
		for (const { pid, holding } of sends(home)) {
			if (!holding) continue;
			const command = Bun.spawnSync(["ps", "-p", String(pid), "-o", "command="]).stdout.toString();
			if (!command.includes(join(home, "superset.ts"))) continue;
			try {
				process.kill(pid, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
			}
		}
	}
});

const sends = (home: string): Array<{ pid: number; args: string[]; holding: boolean }> =>
	existsSync(join(home, "sends.jsonl"))
		? readFileSync(join(home, "sends.jsonl"), "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line))
		: [];
const commands = (home: string): string[][] =>
	readFileSync(join(home, "commands.jsonl"), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean) => {
	const deadline = Date.now() + 20_000;
	let value = await read();
	while (!done(value) && Date.now() < deadline) {
		await Bun.sleep(100);
		value = await read();
	}
	expect(done(value), JSON.stringify(value)).toBe(true);
	return value;
};
const boot = async (home: string) => {
	const server = spawnServer({
		home,
		env: {
			TRELLIS_DB_INLINE: "false",
			TRELLIS_AUTH_TOKEN: token,
			TRELLIS_GH_BIN: "/usr/bin/false",
			TRELLIS_SUPERSET_BIN: join(home, "superset.ts"),
			TRELLIS_CLOCK_RATE: "1",
		},
	});
	servers.push(server);
	const { url } = await server.listening();
	const client = createTrellisClient(url, "human:controller-test", (request, init) => {
		request.headers.set("authorization", `Bearer ${token}`);
		return fetch(request, init);
	});
	return { server, client };
};
const setup = async () => {
	const home = freshHome();
	homes.push(home);
	copyFileSync(new URL("../../../../controller/superset.ts", import.meta.url), join(home, "superset.ts"));
	chmodSync(join(home, "superset.ts"), 0o755);
	const current = await boot(home);
	const { client } = current;
	const project = await client.projects.create({ key: "PCR", name: "Process recovery" });
	await client.projects.setRepos({ project: project.id, repos: [{ owner: "example", repo: "code" }] });
	const manager = await client.personas.create({ name: "Manager", kind: "manager", instruction: "Manage." });
	const builder = await client.personas.create({ name: "Builder", kind: "builder", instruction: "Build." });
	await client.projects.update({
		project: project.id,
		managerConfig: { personaId: manager.id, concurrency: 1, directory: "" },
	});
	await client.agentRuns.start({ project: project.id, personaId: manager.id, requestId: "manager" });
	return { ...current, home, project, manager, builder };
};
const crash = async (server: SpawnedServer) => {
	server.kill("SIGKILL");
	await server.exited();
};

test("a committed ticket event survives hard host restart without duplicate agents", async () => {
	const first = await setup();
	const ticket = await first.client.tickets.create({ project: first.project.id, title: "Persist this work" });
	const assignment = { ticket: ticket.id, personaId: first.builder.id, requestId: "builder" };
	const worker = await first.client.agentRuns.start(assignment);
	const pending = await until(
		() => first.client.controller.list({ projectId: first.project.id }),
		(rows) => rows.some((row) => row.state === "pending"),
	);
	expect(sends(first.home)).toHaveLength(0);
	await crash(first.server);
	const second = await boot(first.home);
	const sent = await until(
		() => second.client.controller.list({ projectId: first.project.id }),
		(rows) => rows.some((row) => row.state === "sent"),
	);
	expect(sent[0]!.id).toBe(pending[0]!.id);
	expect(sent[0]!.events.some((event) => event.ticketId === ticket.id)).toBe(true);
	expect(sends(first.home)).toHaveLength(1);
	expect((await second.client.agentRuns.start(assignment)).id).toBe(worker.id);
	expect(await second.client.agentRuns.list({ project: first.project.id })).toHaveLength(2);
	expect(commands(first.home).filter((args) => args[0] === "ws" && args[1] === "create")).toHaveLength(2);
}, 35_000);

test("a hard crash during a send records unknown and cannot send or launch again", async () => {
	const first = await setup();
	writeFileSync(join(first.home, "hold-send"), "");
	await first.client.tickets.create({ project: first.project.id, title: "Uncertain send" });
	await until(
		async () => sends(first.home),
		(rows) => rows.length === 1,
	);
	const claimed = await first.client.controller.list({ projectId: first.project.id });
	expect(claimed[0]!.state).toBe("sending");
	await crash(first.server);
	const second = await boot(first.home);
	const recovered = await second.client.controller.list({ projectId: first.project.id });
	expect(recovered[0]).toMatchObject({ id: claimed[0]!.id, state: "unknown" });
	await second.client.tickets.create({ project: first.project.id, title: "Later work" });
	await Bun.sleep(1500);
	expect(sends(first.home)).toHaveLength(1);
	expect(await second.client.agentRuns.list({ project: first.project.id })).toHaveLength(1);
	expect(commands(first.home).filter((args) => args[0] === "ws" && args[1] === "create")).toHaveLength(1);
}, 35_000);
