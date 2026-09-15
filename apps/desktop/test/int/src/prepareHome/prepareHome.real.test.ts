import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { MessageBoxOptions } from "electron";
import { originDir } from "../../../../../../test/originDir.ts";
import { connectHost, type HostConnection, waitForHostExit } from "../../../../src/host/host.ts";
import { prepareHome } from "../../../../src/prepareHome/prepareHome.ts";

const resources = resolve(originDir(import.meta.dir), "../../dist/host");

test("the packaged maintenance entry imports a stopped scratch host through the desktop preview", async () => {
	const directory = await mkdtemp("/tmp/trl-real-import-");
	const source = join(directory, "source");
	const target = join(directory, "target");
	let host: HostConnection | undefined;
	let hostHome = source;
	const options = (home: string) => ({
		home,
		executable: join(resources, "bin/bun"),
		entry: join(resources, "apps/server/src/index.ts"),
		webDist: join(resources, "apps/web/dist"),
	});
	try {
		host = await connectHost(options(source));
		const headers = {
			Authorization: `Bearer ${host.token}`,
			"content-type": "application/json",
			"x-trellis-actor": "human:desktop-fixture",
		};
		expect(
			(
				await fetch(`${host.origin}/api/projects`, {
					method: "POST",
					headers,
					body: JSON.stringify({ key: "IMUI", name: "Imported project" }),
				})
			).status,
		).toBe(201);
		expect(
			(
				await fetch(`${host.origin}/api/tickets`, {
					method: "POST",
					headers,
					body: JSON.stringify({ project: "IMUI", title: "Preserve this ticket" }),
				})
			).status,
		).toBe(201);
		process.kill(host.pid, "SIGTERM");
		await waitForHostExit(source);
		host = undefined;
		const messages: MessageBoxOptions[] = [];
		const accepted = await prepareHome(
			{ home: target, resources },
			{
				message: async (options) => {
					messages.push(options);
					return { response: messages.length === 1 ? 2 : messages.length === 2 ? 1 : 0 };
				},
				chooseSource: async () => source,
			},
		);
		expect(accepted).toBe(true);
		expect(messages[1]!.detail).toContain("Projects: 1, tickets: 1");
		expect(messages[1]!.detail).toContain(source);
		expect(messages[1]!.detail).toContain(target);
		hostHome = target;
		host = await connectHost(options(target));
		const importedHeaders = { Authorization: `Bearer ${host.token}` };
		const ticket = (await (await fetch(`${host.origin}/api/tickets/IMUI-1`, { headers: importedHeaders })).json()) as {
			title: string;
		};
		expect(ticket.title).toBe("Preserve this ticket");
		const native = (await (await fetch(`${host.origin}/api/native-work`, { headers: importedHeaders })).json()) as {
			paused: boolean;
		};
		expect(native.paused).toBe(true);
	} finally {
		if (host) {
			process.kill(host.pid, "SIGTERM");
			await waitForHostExit(hostHome);
		}
		await rm(directory, { recursive: true, force: true });
	}
}, 120000);
