import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../..");
const nodePackage = join(repo, "node_modules/node");
const node = join(nodePackage, "bin/node");
const electronPackage = join(repo, "node_modules/electron");
const electronCache = join(homedir(), "Library/Caches/Trellis/electron");

const run = async (args: string[], cwd: string, env = process.env) => {
	const child = Bun.spawn(args, { cwd, env, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
	const code = await child.exited;
	if (code !== 0) throw new Error(`${args[0]} exited ${code}.`);
};

if (!existsSync(node)) await run(["node", "installArchSpecificPackage.js"], nodePackage);
await mkdir(electronCache, { recursive: true });
await run([node, "install.js"], electronPackage, { ...process.env, electron_config_cache: electronCache });
