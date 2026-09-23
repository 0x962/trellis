import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeTrust } from "./claudeTrust.ts";

const state = async (home: string) => JSON.parse(await readFile(join(home, ".claude.json"), "utf8"));

test("one write covers every launch and drops the entry of a removed agent worktree", async () => {
	const home = await realpath(await mkdtemp(join(tmpdir(), "trellis-claude-trust-")));
	const agents = join(home, "agents");
	const gone = join(agents, "OLD", "work");
	const kept = join(agents, "LIVE", "work");
	const mine = join(home, "projects", "site");
	await mkdir(kept, { recursive: true });
	await mkdir(mine, { recursive: true });
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({
			hasCompletedOnboarding: true,
			projects: {
				[gone]: { hasTrustDialogAccepted: true },
				[kept]: { hasTrustDialogAccepted: true },
				[mine]: { hasTrustDialogAccepted: true, history: ["one"] },
			},
		}),
	);
	const started: string[] = [];
	for (let index = 0; index < 5; index++) {
		const directory = join(agents, `RUN${index}`, "work");
		await mkdir(directory, { recursive: true });
		started.push(directory);
	}
	await Promise.all(started.map((directory) => claudeTrust(directory, { HOME: home }, agents)));
	const projects = (await state(home)).projects;
	for (const directory of started) expect(projects[directory].hasTrustDialogAccepted).toBe(true);
	expect(projects[gone]).toBeUndefined();
	expect(projects[kept].hasTrustDialogAccepted).toBe(true);
	expect(projects[mine]).toEqual({ hasTrustDialogAccepted: true, history: ["one"] });
	await rm(home, { recursive: true, force: true });
});

test("a directory outside the agents directory keeps its entry when it is gone", async () => {
	const home = await realpath(await mkdtemp(join(tmpdir(), "trellis-claude-trust-")));
	const agents = join(home, "agents");
	const removed = join(home, "elsewhere", "gone");
	const directory = join(agents, "RUN", "work");
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({ hasCompletedOnboarding: true, projects: { [removed]: { hasTrustDialogAccepted: true } } }),
	);
	await claudeTrust(directory, { HOME: home }, agents);
	expect((await state(home)).projects[removed].hasTrustDialogAccepted).toBe(true);
	await rm(home, { recursive: true, force: true });
});

test("a trusted directory writes nothing", async () => {
	const home = await realpath(await mkdtemp(join(tmpdir(), "trellis-claude-trust-")));
	const agents = join(home, "agents");
	const directory = join(agents, "RUN", "work");
	const gone = join(agents, "OLD", "work");
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({
			hasCompletedOnboarding: true,
			projects: { [directory]: { hasTrustDialogAccepted: true }, [gone]: { hasTrustDialogAccepted: true } },
		}),
	);
	await claudeTrust(directory, { HOME: home }, agents);
	expect((await state(home)).projects[gone].hasTrustDialogAccepted).toBe(true);
	await rm(home, { recursive: true, force: true });
});
