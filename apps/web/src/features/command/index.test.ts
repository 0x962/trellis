import { beforeAll, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const web = join(import.meta.dir, "..", "..", "..");

// This build writes to its own directory, so it never races the build the
// size budget reads.
const dist = join(process.env.TRELLIS_HOME!, "command-bundle-build");

const run = (args: string[]) => {
	const result = Bun.spawnSync(["bun", ...args], { cwd: web, stdout: "pipe", stderr: "pipe" });
	return { exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
};

const fileName = (url: string) => url.split("/").pop()!;

const readAsset = (name: string) => Bun.file(join(dist, "assets", name)).text();

// The entry chunk plus every chunk index.html preloads: what runs before
// the first route opens.
const initialSource = async () => {
	const html = await Bun.file(join(dist, "index.html")).text();
	const entry = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)![1]!;
	const preloads = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((match) => match[1]!);
	const names = [entry, ...preloads].map(fileName);
	const sources = await Promise.all(names.map(readAsset));
	return { names, source: sources.join("\n") };
};

// Strings only the palette ships: the dialog name, a section heading, and a
// View row. The dialog name also sits in the shared Command chunk.
const commandMarkers = ["Command menu", "Search results", "Toggle density"];

// The field placeholder. Only the palette body chunk carries it.
const paletteBodyMarker = "Type a command or search tickets";

// Strings the rich text editor ships. The editor is lazy, so none of them
// belongs in the initial JavaScript.
const editorMarkers = ["ProseMirror", "prosemirror", "@tiptap"];

describe("features/command bundle", () => {
	let build: ReturnType<typeof run>;
	beforeAll(() => {
		build = run(["run", "build", "--outDir", dist, "--emptyOutDir"]);
	}, 180_000);

	// BD-01. The editor opens on a ticket, so the command feature must not
	// pull it into the initial JavaScript.
	test("the command feature pulls no editor chunk into the initial bundle", async () => {
		if (build.exitCode !== 0) console.log(build.output);
		expect(build.exitCode).toBe(0);
		const initial = await initialSource();
		for (const marker of editorMarkers) expect(initial.source, marker).not.toContain(marker);
	});

	// BD-02. The palette body is a lazy chunk. The entry chunk names that
	// chunk, because the shell loads it on idle before the first Cmd+K.
	test("the palette body is a chunk the entry does not preload", async () => {
		expect(build.exitCode).toBe(0);
		const initial = await initialSource();
		const lazy = readdirSync(join(dist, "assets")).filter(
			(name) => name.endsWith(".js") && !initial.names.includes(name),
		);
		const holders = async (marker: string) => {
			const found: string[] = [];
			for (const name of lazy) if ((await readAsset(name)).includes(marker)) found.push(name);
			return found;
		};
		for (const marker of commandMarkers) {
			expect(initial.source, marker).not.toContain(marker);
			expect((await holders(marker)).length, marker).toBeGreaterThan(0);
		}
		const body = await holders(paletteBodyMarker);
		expect(body).toHaveLength(1);
		expect(initial.source).toContain(body[0]!);
	});
});
