import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeTrust } from "./claudeTrust.ts";

const readState = async (home: string) => JSON.parse(await readFile(join(home, ".claude.json"), "utf8"));
const newHome = async () => realpath(await mkdtemp(join(tmpdir(), "trellis-claude-trust-")));

test("the launches share a write, and the write drops the entry of a removed agent worktree", async () => {
	const home = await newHome();
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
	const startedDirectories: string[] = [];
	for (let index = 0; index < 5; index++) {
		const directory = join(agents, `RUN${index}`, "work");
		await mkdir(directory, { recursive: true });
		startedDirectories.push(directory);
	}
	const lines: { message: string; fields?: Record<string, unknown> }[] = [];
	await Promise.all(
		startedDirectories.map((directory) =>
			claudeTrust(directory, { HOME: home }, agents, (message, fields) => lines.push({ message, fields })),
		),
	);
	const projects = (await readState(home)).projects;
	for (const directory of startedDirectories) expect(projects[directory].hasTrustDialogAccepted).toBe(true);
	expect(projects[gone]).toBeUndefined();
	expect(projects[kept].hasTrustDialogAccepted).toBe(true);
	expect(projects[mine]).toEqual({ hasTrustDialogAccepted: true, history: ["one"] });
	// The launches share a write, so the file is written fewer times than the
	// number of launches, and every launch is in one of those writes.
	expect(lines.length).toBeLessThan(startedDirectories.length);
	expect(lines.every((line) => line.message === "claude trust written")).toBe(true);
	expect(lines.reduce((total, line) => total + (line.fields!.trusted as number), 0)).toBe(5);
	expect(lines.reduce((total, line) => total + (line.fields!.removed as number), 0)).toBe(1);
	await rm(home, { recursive: true, force: true });
});

test("a directory outside the agents directory keeps its entry when it is gone", async () => {
	const home = await newHome();
	const agents = join(home, "agents");
	const removed = join(home, "elsewhere", "gone");
	const directory = join(agents, "RUN", "work");
	await mkdir(directory, { recursive: true });
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({ hasCompletedOnboarding: true, projects: { [removed]: { hasTrustDialogAccepted: true } } }),
	);
	await claudeTrust(directory, { HOME: home }, agents);
	expect((await readState(home)).projects[removed].hasTrustDialogAccepted).toBe(true);
	await rm(home, { recursive: true, force: true });
});

test("a trusted directory writes nothing", async () => {
	const home = await newHome();
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
	expect((await readState(home)).projects[gone].hasTrustDialogAccepted).toBe(true);
	await rm(home, { recursive: true, force: true });
});

test("a symbolic link on the path of the agents directory keeps the removal working", async () => {
	const home = await newHome();
	const real = join(home, "real-agents");
	const link = join(home, "agents");
	const gone = join(real, "OLD", "work");
	await mkdir(join(real, "RUN", "work"), { recursive: true });
	await symlink(real, link);
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({ hasCompletedOnboarding: true, projects: { [gone]: { hasTrustDialogAccepted: true } } }),
	);
	await claudeTrust(join(link, "RUN", "work"), { HOME: home }, link);
	const projects = (await readState(home)).projects;
	expect(projects[gone]).toBeUndefined();
	expect(projects[join(real, "RUN", "work")].hasTrustDialogAccepted).toBe(true);
	await rm(home, { recursive: true, force: true });
});
