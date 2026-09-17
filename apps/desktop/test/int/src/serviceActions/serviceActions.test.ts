import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";

let directory: string;
let runner: string;
beforeAll(async () => {
	directory = await mkdtemp("/tmp/trl-service-actions-");
	const entry = join(directory, "entry.ts");
	runner = join(directory, "runner.js");
	await writeFile(
		entry,
		`
import { requireService } from ${JSON.stringify(resolve(originDir(import.meta.dir), "serviceActions.ts"))};
let error;
try {
 for (let i = 0; i < Number(process.argv[4]); i++) await requireService(process.argv[2], process.argv[3]);
} catch (caught) { error = caught.message; }
process.stdout.write(JSON.stringify({ error, dialogs: globalThis.dialogs }));
`,
	);
	const build = await Bun.build({
		entrypoints: [entry],
		target: "bun",
		format: "esm",
		plugins: [
			{
				name: "electron-dialog",
				setup(builder) {
					builder.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "fixture" }));
					builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
						loader: "js",
						contents: `
globalThis.dialogs = [];
export const dialog = { showMessageBox: async (options) => {
 globalThis.dialogs.push(options.message);
 return {response: 0};
}};`,
					}));
				},
			},
		],
	});
	if (!build.success) throw new AggregateError(build.logs, "Service actions fixture build failed");
	await writeFile(runner, await build.outputs[0]!.text());
});
afterAll(() => rm(directory, { recursive: true, force: true }));

const run = async (status: string, registered = "enabled", launches = 1) => {
	const home = await mkdtemp(join(directory, "home-"));
	const helper = join(home, "helper");
	const state = join(home, "state.json");
	const commands = join(home, "commands.txt");
	await mkdir(join(home, "data"));
	await writeFile(state, JSON.stringify({ status, bundle: "isolated fixture" }));
	await writeFile(commands, "");
	await writeFile(
		helper,
		`#!${process.execPath}
import {readFileSync, writeFileSync, appendFileSync} from "node:fs";
const command = process.argv[2];
appendFileSync(${JSON.stringify(commands)}, command + "\\n");
if (command === "register") writeFileSync(${JSON.stringify(state)}, JSON.stringify({status: ${JSON.stringify(registered)}, bundle: "isolated fixture"}));
process.stdout.write(readFileSync(${JSON.stringify(state)}, "utf8"));
`,
	);
	await chmod(helper, 0o700);
	const child = Bun.spawn([process.execPath, runner, helper, join(home, "data"), String(launches)], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect(exitCode, stderr).toBe(0);
	return {
		...(JSON.parse(stdout) as { error?: string; dialogs: string[] }),
		commands: (await readFile(commands, "utf8")).trim().split("\n"),
	};
};

test.each(["notRegistered", "notFound"])(
	"startup automatically registers %s and reuses it on the next launch",
	async (status) => {
		const result = await run(status, "enabled", 2);
		expect(result.error).toBeUndefined();
		expect(result.dialogs).toEqual([]);
		expect(result.commands).toEqual(["status", "register", "status"]);
	},
);
test("an enabled service needs no startup dialog or registration", async () => {
	const result = await run("enabled", "enabled", 2);
	expect(result.error).toBeUndefined();
	expect(result.dialogs).toEqual([]);
	expect(result.commands).toEqual(["status", "status"]);
});
test.each(["notRegistered", "requiresApproval"])(
	"only actual macOS approval opens System Settings from %s",
	async (status) => {
		const result = await run(status, "requiresApproval");
		expect(result.error).toBe("Background service status: requiresApproval.");
		expect(result.dialogs).toEqual(["Allow Trellis in Login Items"]);
		expect(result.commands).toEqual(
			status === "notRegistered" ? ["status", "register", "settings"] : ["status", "settings"],
		);
	},
);
