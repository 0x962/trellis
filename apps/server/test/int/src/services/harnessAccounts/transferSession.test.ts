import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { transferSession } from "../../../../../src/services/harnessAccounts/transferSession.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});
for (const [harness, relative] of [
	["claude", "projects/-tmp-work/session-123.jsonl"],
	["codex", "sessions/2026/09/16/rollout-session-123.jsonl"],
	["pi", "sessions/--tmp-work--/2026_session-123.jsonl"],
] as const) {
	test(`${harness} transfers the exact session without copying the account credentials`, async () => {
		const home = await mkdtemp("/tmp/trellis-account-transfer-");
		homes.push(home);
		const from = join(home, "from"),
			to = join(home, "to");
		await mkdir(join(from, relative, ".."), { recursive: true });
		await mkdir(to);
		await writeFile(join(from, relative), "conversation\n");
		await writeFile(join(from, "auth.json"), "source-secret");
		await writeFile(join(to, "auth.json"), "target-secret");
		await transferSession({ harness, from, to, sessionId: "session-123", cwd: "/tmp/work", env: {}, directory: home });
		expect(await readFile(join(to, relative), "utf8")).toBe("conversation\n");
		expect(await readFile(join(to, "auth.json"), "utf8")).toBe("target-secret");
		await writeFile(join(to, relative), "conversation\ncontinued\n");
		await transferSession({
			harness,
			from: to,
			to: from,
			sessionId: "session-123",
			cwd: "/tmp/work",
			env: {},
			directory: home,
		});
		expect(await readFile(join(from, relative), "utf8")).toBe("conversation\ncontinued\n");
	});
}

test("managed profiles find conversations through shared session directories", async () => {
	const home = await mkdtemp("/tmp/trellis-account-transfer-");
	homes.push(home);
	const from = join(home, "from"),
		to = join(home, "to"),
		shared = join(home, "shared");
	await mkdir(from);
	await mkdir(to);
	await mkdir(join(shared, "work"), { recursive: true });
	await symlink(shared, join(from, "projects"));
	await writeFile(join(shared, "work", "session-123.jsonl"), "shared conversation");
	await transferSession({ harness: "claude", from, to, sessionId: "session-123", cwd: home, env: {}, directory: home });
	expect(await readFile(join(to, "projects", "work", "session-123.jsonl"), "utf8")).toBe("shared conversation");
});
