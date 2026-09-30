import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../..", import.meta.url));
const directory = await realpath(await mkdtemp(join(tmpdir(), "trellis-ui-preview-test-")));
const token = "fixture-only-token";
let vite: ChildProcess | undefined;
let closed = false;
let staticCredentials = 0;
const closeVite = async () => {
	if (!vite || closed) return;
	await new Promise<void>((resolve) => {
		vite!.once("message", (message) => {
			staticCredentials = (message as { staticCredentials: number }).staticCredentials;
			closed = true;
			resolve();
		});
		vite!.send("close");
	});
};
const host = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch: async (request, server) => {
		const url = new URL(request.url);
		if (url.pathname === "/stop-preview") {
			await closeVite();
			return new Response("stopped");
		}
		if (request.headers.get("Authorization") !== `Bearer ${token}`)
			return new Response("Unauthorized", { status: 401 });
		if (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin)
			return new Response("Origin refused", { status: 403 });
		if (url.pathname === "/api/socket") {
			if (server.upgrade(request)) return;
			return new Response("Upgrade refused", { status: 400 });
		}
		if (url.pathname === "/api/events")
			return new Response("data: ready\n\n", { headers: { "Content-Type": "text/event-stream" } });
		if (url.pathname === "/rpc/echo") return Response.json({ body: await request.text() });
		return new Response("<body>Installed UI</body>", { headers: { "Content-Type": "text/html" } });
	},
	websocket: {
		message: (socket, message) => {
			socket.send(message);
		},
	},
});

try {
	await writeFile(
		join(directory, "index.html"),
		'<div id="root"></div><script type="module" src="/main.tsx"></script>',
	);
	await writeFile(
		join(directory, "main.tsx"),
		'import { createRoot } from "react-dom/client"; import App from "./App"; import "./style.css"; createRoot(document.getElementById("root")!).render(<App />);',
	);
	await writeFile(
		join(directory, "App.tsx"),
		'import { useState } from "react"; export default function App() { const [count, setCount] = useState(0); return <button onClick={() => setCount(count + 1)}>Before: {count}</button>; }',
	);
	await writeFile(join(directory, "style.css"), "button { color: rgb(255, 0, 0); }");
	const portHolder = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
	const port = portHolder.port!;
	await portHolder.stop(true);
	vite = spawn(
		"node",
		[fileURLToPath(new URL("./viteFixture.ts", import.meta.url)), directory, root, host.url.origin, String(port)],
		{ stdio: ["ignore", "inherit", "inherit", "ipc"] },
	);
	await new Promise<void>((resolve, reject) => {
		vite!.once("message", () => resolve());
		vite!.once("error", reject);
		vite!.once("exit", (code) => reject(new Error(`Vite exits with ${code}.`)));
	});
	const previewOrigin = `http://127.0.0.1:${port}`;
	assert.equal((await fetch(`${previewOrigin}/api/private`)).status, 401);
	assert.equal(
		(
			await fetch(`${previewOrigin}/rpc/echo`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}`, Origin: "http://untrusted.example" },
			})
		).status,
		403,
	);
	for (const [entry, name] of [
		[join(root, "apps/desktop/src/preload.ts"), "preload.cjs"],
		[fileURLToPath(new URL("./electronProbe.ts", import.meta.url)), "probe.cjs"],
	]) {
		const build = await Bun.build({ entrypoints: [entry!], target: "node", format: "cjs", external: ["electron"] });
		assert(build.success, build.logs.map(String).join("\n"));
		await Bun.write(join(directory, name!), build.outputs[0]!);
	}
	await writeFile(
		join(directory, "input.json"),
		JSON.stringify({ directory, hostOrigin: host.url.origin, previewOrigin, token }),
	);
	const require = createRequire(import.meta.url);
	const executable = process.env.TRELLIS_TEST_ELECTRON ?? require("electron");
	const child = spawn(executable, [join(directory, "probe.cjs"), join(directory, "input.json")], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	let output = "";
	child.stdout!.on("data", (chunk) => {
		output += String(chunk);
		process.stdout.write(chunk);
	});
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		child.kill("SIGTERM");
	}, 60000);
	try {
		const result = await new Promise<number | null>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", resolve);
		});
		assert.equal(result, 0, "Electron preview fixture must exit successfully");
		assert.equal(timedOut, false, "Electron preview fixture must finish before its deadline");
		assert(output.includes("PASS: React and CSS hot reload"));
		assert.equal(staticCredentials, 0, "Static files must receive no host credential");
		console.log("PASS: anonymous API refusal; foreign Origin refusal; no credential on preview assets.");
	} finally {
		clearTimeout(timeout);
	}
} finally {
	if (vite && vite.exitCode === null && vite.signalCode === null) {
		const exited = once(vite, "exit");
		vite.kill("SIGTERM");
		await exited;
	}
	await host.stop(true);
	await rm(directory, { recursive: true, force: true });
}
