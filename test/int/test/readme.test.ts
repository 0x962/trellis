import { originDir } from "../../originDir.ts";
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { Subprocess } from "bun";

// The README is a script as well as a document. A fenced block with the info
// string `sh test` runs here, in README order, against a temp data home and a
// free port. `sh test skip` marks a block that changes the machine, such as a
// dependency install, so the test lists it and never runs it. `sh test
// background` marks a block that runs until the test ends, such as the
// server, and the next block starts once `/api/health` answers.
const root = join(originDir(import.meta.dir), "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

type Block = { mode: "run" | "skip" | "background"; body: string };

const blocks = (markdown: string): Block[] =>
	[...markdown.matchAll(/^```sh test( skip| background)?\n([\s\S]*?)^```$/gm)].map((match) => ({
		mode: match[1] === undefined ? "run" : (match[1].trim() as "skip" | "background"),
		body: match[2]!,
	}));

const freePort = () =>
	new Promise<number>((done) => {
		const probe = createServer();
		probe.listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => done(port));
		});
	});

// A `trellis` on PATH that runs the CLI from this checkout, so a block runs
// the same command a reader types after `trellis install`.
const shimDir = (home: string) => {
	const dir = join(home, "shim");
	mkdirSync(dir);
	const shim = join(dir, "trellis");
	writeFileSync(shim, `#!/bin/sh\nexec bun "${join(root, "packages", "cli", "src", "index.ts")}" "$@"\n`);
	chmodSync(shim, 0o755);
	return dir;
};

// The gh stub answers `gh auth status` as signed out, so the server never
// runs the gh of the machine that runs the test.
const ghEnv = (home: string) => {
	const replies = join(home, "gh-replies.json");
	writeFileSync(replies, JSON.stringify({ "auth status": { stdout: "", stderr: "not logged in", exitCode: 1 } }));
	return {
		TRELLIS_GH_BIN: join(root, "apps", "server", "test", "stubs", "gh.ts"),
		TRELLIS_GH_STUB_FILE: replies,
		TRELLIS_GH_STUB_LOG: join(home, "gh-spawns.log"),
	};
};

const waitForHealth = async (url: string, proc: Subprocess) => {
	for (let attempt = 0; attempt < 150; attempt++) {
		if (proc.exitCode !== null) throw new Error(`the background block exited with ${proc.exitCode}`);
		const ok = await fetch(`${url}/api/health`).then(
			(response) => response.ok,
			() => false,
		);
		if (ok) return;
		await Bun.sleep(200);
	}
	throw new Error(`no answer from ${url}/api/health`);
};

const background: Subprocess[] = [];

afterAll(async () => {
	for (const proc of background) {
		proc.kill("SIGTERM");
		await proc.exited;
	}
});

describe("README shell blocks", () => {
	const all = blocks(readme);

	test("the dependency install is a skipped block and the server is a background block", () => {
		expect(all.some((block) => block.mode === "skip" && block.body.includes("bun install"))).toBe(true);
		expect(all.some((block) => block.mode === "background" && block.body.trim() === "trellis serve")).toBe(true);
		const run = all.filter((block) => block.mode === "run").map((block) => block.body);
		expect(run.some((body) => body.includes("trellis projects create"))).toBe(true);
		expect(run.some((body) => /^trellis create /m.test(body))).toBe(true);
		expect(run.some((body) => body.includes("trellis list") && body.includes("--json"))).toBe(true);
	});

	test("every sh test block exits 0 in README order and list --json prints the new ticket", async () => {
		const home = mkdtempSync(join(process.env.TRELLIS_HOME!, "readme-"));
		const port = await freePort();
		const url = `http://127.0.0.1:${port}`;
		const env = {
			...process.env,
			...ghEnv(home),
			PATH: `${shimDir(home)}:${process.env.PATH}`,
			TRELLIS_HOME: join(home, "data"),
			TRELLIS_PORT: String(port),
			TRELLIS_URL: url,
			TRELLIS_ACTOR: "human:readme",
		};
		const outputs: Array<{ body: string; stdout: string }> = [];
		for (const block of all) {
			if (block.mode === "skip") continue;
			if (block.mode === "background") {
				const proc = Bun.spawn(["sh", "-c", block.body], { cwd: home, env, stdout: "ignore", stderr: "ignore" });
				background.push(proc);
				await waitForHealth(url, proc);
				continue;
			}
			const result = Bun.spawnSync(["sh", "-e", "-c", block.body], { cwd: home, env, stdout: "pipe", stderr: "pipe" });
			expect(result.exitCode, `${block.body}\n${result.stderr.toString()}`).toBe(0);
			outputs.push({ body: block.body, stdout: result.stdout.toString() });
		}
		const list = outputs.find((output) => output.body.includes("trellis list") && output.body.includes("--json"))!;
		const tickets = JSON.parse(list.stdout) as Array<{ identifier: string; title: string }>;
		expect(tickets.length).toBeGreaterThan(0);
		expect(tickets.map((ticket) => ticket.identifier)).toContain("TRL-1");
	}, 120_000);
});

describe("README content", () => {
	test("README has a section for each part of the product", () => {
		for (const heading of [
			"## What it is",
			"## Install",
			"## Daily use",
			"## Agents",
			"## Mobile",
			"## Data and backups",
			"## Development",
		]) {
			expect(readme, heading).toContain(`\n${heading}\n`);
		}
	});

	test("README names the gateway routes file, the actor header, and every CLI exit code", () => {
		expect(readme).toContain("~/.config/localhost-gateway/routes.json");
		expect(readme).toContain('"trellis": 4521');
		expect(readme).toContain("trellis.localhost");
		expect(readme).toContain("trellis instructions");
		expect(readme).toContain("x-trellis-actor");
		for (let code = 0; code <= 7; code++) expect(readme).toMatch(new RegExp(`^\\| ${code} \\|`, "m"));
		for (const command of ["bun run dev", "bun run check", "bun run e2e", "bun run perf"]) {
			expect(readme, command).toContain(command);
		}
	});

	// A PNG starts with an 8-byte signature. The IHDR chunk follows, and its
	// first field is the image width as a big-endian 32-bit integer.
	test("README shows the Needs you page and a ticket with a PR ribbon from the running app", () => {
		for (const image of ["docs/images/needs-you.png", "docs/images/ticket-pr.png"]) {
			expect(existsSync(join(root, image)), image).toBe(true);
			const bytes = readFileSync(join(root, image));
			expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
			expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(1200);
			expect(readme).toMatch(new RegExp(`!\\[[^\\]]+\\]\\(${image.replaceAll(".", "\\.")}\\)`));
		}
	});
});
