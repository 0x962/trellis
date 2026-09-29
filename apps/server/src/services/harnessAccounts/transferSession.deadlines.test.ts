import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transferSession } from "./transferSession.ts";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(exportBody: string, importBody: string) {
	const root = await mkdtemp(join(tmpdir(), "trellis-transfer-deadline-"));
	roots.push(root);
	const from = join(root, "from");
	const to = join(root, "to");
	await Promise.all([mkdir(from), mkdir(to)]);
	await writeFile(
		join(root, "opencode"),
		`#!/bin/sh\nset -e\nprintf '%s\\n' "$1" >> calls\ncase "$1" in\nexport)\n${exportBody}\n;;\nimport)\n${importBody}\n;;\nesac\n`,
		{ mode: 0o700 },
	);
	return {
		harness: "opencode" as const,
		from,
		to,
		sessionId: "session_757",
		cwd: root,
		env: { PATH: `${root}:/usr/bin:/bin` },
		directory: join(root, "transfer"),
	};
}

const exportResult = `printf '{"info":{"id":"session_757"},"messages":[]}'`;
const importResult = `printf 'Imported session: session_757'`;

test("waits for both transfer commands beyond thirty seconds", async () => {
	const input = await fixture(`sleep 30.2\n${exportResult}`, `sleep 30.2\n${importResult}`);
	await transferSession(input);
	expect(await readFile(join(input.directory, "session.json"), "utf8")).toBe(
		'{"info":{"id":"session_757"},"messages":[]}',
	);
	expect(await readFile(join(input.cwd, "calls"), "utf8")).toBe("export\nimport\n");
}, 90_000);

test("does not import output from a failed export", async () => {
	const input = await fixture(`${exportResult}\nexit 23`, importResult);
	await expect(transferSession(input)).rejects.toThrow();
	expect(await readFile(join(input.cwd, "calls"), "utf8")).toBe("export\n");
	expect(await Bun.file(join(input.directory, "session.json")).exists()).toBe(false);
});

test("rejects a terminated export with complete JSON output", async () => {
	const input = await fixture(`${exportResult}\nkill -TERM $$`, importResult);
	await expect(transferSession(input)).rejects.toThrow();
	expect(await readFile(join(input.cwd, "calls"), "utf8")).toBe("export\n");
});

test("rejects a failed import even when it prints confirmation", async () => {
	const input = await fixture(exportResult, `${importResult}\nexit 23`);
	await expect(transferSession(input)).rejects.toThrow();
});

test("rejects a terminated import even when it prints confirmation", async () => {
	const input = await fixture(exportResult, `${importResult}\nkill -TERM $$`);
	await expect(transferSession(input)).rejects.toThrow();
});
