import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { serverSource } from "../../../src/source.ts";

const git = (args: string[], cwd: string) =>
	Bun.spawnSync(["git", ...args], { cwd })
		.stdout.toString()
		.trim();

describe("serverSource", () => {
	test("the server names the root of its checkout and the commit at its HEAD", () => {
		const root = git(["rev-parse", "--show-toplevel"], import.meta.dir);

		const source = serverSource();

		expect(source).toEqual({ checkout: root, commit: git(["rev-parse", "HEAD"], root) });
	});

	test("a checkout that is not a git work tree has no commit", () => {
		const plain = mkdtempSync(join(process.env.TRELLIS_HOME!, "plain-"));

		expect(serverSource(plain)).toEqual({ checkout: plain, commit: null });
	});
});
