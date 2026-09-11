import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The Jest suite runs against the real trellis server. Node cannot import
// that server: it uses bun:ffi, import.meta.dir, Bun.serve, Bun.file, and a
// Bun Worker. So this setup spawns `bun apps/server/src/index.ts` once, and
// every test reaches it over HTTP.
//
// TRELLIS_PORT=0 asks the kernel for a free port, and the boot logs that port
// on its "listening" line, because stdout is a pipe and not a TTY.
//
// TRELLIS_GH_BIN points every gh call at apps/server/test/stubs/gh.ts, so the
// suite needs no GitHub login. The stub answers `auth status` with a failure,
// which stops the pull request poller at its first step: a poll never
// rewrites a seeded pull request. A seed writes the `api graphql` reply into
// the same file before it links a pull request.

type Record_ = { msg: string; port?: number };

const mobileDir = join(__dirname, "..");
const serverDir = join(mobileDir, "..", "server");

const signedOut = {
	stdout: "",
	stderr: "To get started with GitHub CLI, please run: gh auth login",
	exitCode: 1,
};

// Resolves with the port the boot logged, or rejects once the child exits
// before it logs the line.
const listeningPort = (child: ChildProcess, stderr: string[]) =>
	new Promise<number>((resolve, reject) => {
		let buffer = "";
		child.stdout!.on("data", (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (line.length === 0) continue;
				const record = JSON.parse(line) as Record_;
				if (record.msg === "listening") resolve(record.port!);
			}
		});
		child.stderr!.on("data", (chunk: Buffer) => void stderr.push(chunk.toString()));
		child.on("exit", (code) => reject(new Error(`the server exited ${code}: ${stderr.join("")}`)));
	});

export default async () => {
	const home = mkdtempSync(join(tmpdir(), "trellis-mobile-"));
	const replies = join(home, "gh-replies.json");
	writeFileSync(replies, JSON.stringify({ "auth status": signedOut }));
	const child = spawn("bun", ["src/index.ts"], {
		cwd: serverDir,
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			NODE_ENV: "production",
			TRELLIS_HOME: home,
			TRELLIS_PORT: "0",
			TRELLIS_LOG_LEVEL: "info",
			TRELLIS_WEB_DIST: join(home, "no-web-dist"),
			TRELLIS_GH_BIN: join(serverDir, "test", "stubs", "gh.ts"),
			TRELLIS_GH_STUB_FILE: replies,
			TRELLIS_GH_STUB_LOG: join(home, "gh-spawns.log"),
		},
	});
	const stderr: string[] = [];
	const port = await listeningPort(child, stderr);
	child.stdout!.resume();
	process.env.TRELLIS_TEST_SERVER_URL = `http://127.0.0.1:${port}`;
	process.env.TRELLIS_TEST_GH_REPLIES = replies;
	(globalThis as { trellisServer?: ChildProcess }).trellisServer = child;
};
