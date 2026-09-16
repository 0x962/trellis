import { expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createTrellisClient } from "@trellis/api";
import { ghStub } from "../../helpers/gh-stub.ts";
import { freshHome } from "../../helpers/home.ts";
import { spawnServer, stopServer } from "../../helpers/server.ts";

test("authenticated health and tickets work while the execution shell waits", async () => {
	const home = freshHome();
	const shell = join(home, "shell");
	const marker = join(home, "shell-started");
	const release = join(home, "shell-release");
	writeFileSync(
		shell,
		'#!/bin/sh\nprintf started > "$TRELLIS_EXECUTION_PROBE"\nwhile [ ! -f "$TRELLIS_EXECUTION_RELEASE" ]; do /bin/sleep 0.05; done\n/usr/bin/env -0\n',
		{ mode: 0o700 },
	);
	const stub = ghStub(home, {
		"auth status": { stdout: "Logged in to github.com account fixture", stderr: "", exitCode: 0 },
	});
	const token = "fixture-auth-token";
	const server = spawnServer({
		home,
		env: {
			TRELLIS_AUTH_TOKEN: token,
			TRELLIS_EXECUTION_SHELL: shell,
			TRELLIS_EXECUTION_BIN: dirname(process.execPath),
			TRELLIS_EXECUTION_PROBE: marker,
			TRELLIS_EXECUTION_RELEASE: release,
		},
	});
	try {
		const { url } = await server.listening();
		expect(existsSync(marker)).toBe(true);
		expect(stub.spawns()).toEqual([]);
		const headers = { Authorization: `Bearer ${token}` };
		expect((await fetch(`${url}/api/health`, { headers })).status).toBe(200);
		expect((await fetch(`${url}/api/health`)).status).toBe(401);
		const client = createTrellisClient(url, "human:fixture", (request, init) => {
			const authenticated = new Headers(request.headers);
			authenticated.set("Authorization", `Bearer ${token}`);
			return fetch(new Request(request, { headers: authenticated }), init);
		});
		await client.projects.create({ key: "ENV", name: "Environment boot" });
		const ticket = await client.tickets.create({ project: "ENV", title: "Read during shell setup" });
		expect((await client.tickets.get({ ticket: ticket.identifier })).title).toBe(ticket.title);
		expect(stub.spawns()).toEqual([]);
		writeFileSync(release, "ready");
		await server.waitFor("gh");
		expect(stub.spawns()).toHaveLength(1);
	} finally {
		writeFileSync(release, "ready");
		await stopServer(server);
		stub.restore();
	}
}, 15000);
