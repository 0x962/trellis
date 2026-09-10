import { beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

const web = join(import.meta.dir, "..", "..", "..");

// This build writes to its own directory, so it never races the build the
// size budget reads.
const dist = join(process.env.TRELLIS_HOME!, "command-bundle-build");

const run = (args: string[]) => {
	const result = Bun.spawnSync(["bun", ...args], { cwd: web, stdout: "pipe", stderr: "pipe" });
	return { exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
};

const readAsset = (url: string) => Bun.file(join(dist, url.replace(/^\//, ""))).text();

// The entry chunk plus every chunk index.html preloads: what runs before
// the first route opens.
const initialSource = async () => {
	const html = await Bun.file(join(dist, "index.html")).text();
	const entry = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)![1]!;
	const preloads = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((match) => match[1]!);
	const sources = await Promise.all([entry, ...preloads].map(readAsset));
	return sources.join("\n");
};

// Strings only the command feature ships.
const commandMarkers = ["Command menu", "Search results", "Toggle density"];

// Strings the rich text editor ships. The editor is lazy, so none of them
// belongs in the initial JavaScript.
const editorMarkers = ["ProseMirror", "prosemirror", "@tiptap"];

describe("features/command bundle", () => {
	let build: ReturnType<typeof run>;
	beforeAll(() => {
		build = run(["run", "build", "--outDir", dist, "--emptyOutDir"]);
	}, 180_000);

	// BD-01. The palette answers the first Cmd+K, so it ships with the
	// shell; the editor opens on a ticket, so it stays lazy.
	test("the command feature pulls no editor chunk into the initial bundle", async () => {
		if (build.exitCode !== 0) console.log(build.output);
		expect(build.exitCode).toBe(0);
		const initial = await initialSource();
		for (const marker of commandMarkers) expect(initial, marker).toContain(marker);
		for (const marker of editorMarkers) expect(initial, marker).not.toContain(marker);
	});
});
