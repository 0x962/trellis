import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { capacityAvailable, capacityOf } from "../../../../../src/services/assignments/capacity.ts";
import { seedRoot } from "../../../../fixtures/projects.ts";
import { workingSession } from "../../../../helpers/controllerSession.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";

let h: Harness;
let project: string;

beforeAll(async () => {
	h = await serviceHarness();
});

afterAll(() => h.close());

beforeEach(async () => {
	await h.reset();
	project = await h.read((tx) =>
		seedRoot(tx, "CAP", {
			manager_config: { ade: "native", personaId: null, concurrency: 4, directory: "/tmp" },
		}),
	);
});

const addRun = (
	id: string,
	kind: "builder" | "reviewer" | "manager",
	runtime: "native" | "superset",
	closed: boolean,
) =>
	h.rows(sql`INSERT INTO agent_runs
		(id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,closed_at,created_at,updated_at)
		VALUES (${id},${id},${runtime},${id},${kind},'',${project},'CAP',${id},${closed ? new Date() : null},now(),now())`);

test("capacity matches the scheduler rule", async () => {
	await addRun("builder", "builder", "native", false);
	await addRun("reviewer", "reviewer", "native", false);
	await addRun("manager", "manager", "native", false);
	await addRun("external", "builder", "superset", false);
	await addRun("history", "builder", "native", true);
	const sessions = [workingSession("builder"), workingSession("reviewer")];

	expect(await h.read((tx) => capacityOf(tx, { projectId: project, sessions }))).toEqual({ used: 2, limit: 4 });
	expect(await h.read((tx) => capacityAvailable(tx, { projectId: project, sessions }))).toBe(true);

	await addRun("third", "builder", "native", false);
	await addRun("fourth", "reviewer", "native", false);
	sessions.push(workingSession("third"), workingSession("fourth"));
	expect(await h.read((tx) => capacityOf(tx, { projectId: project, sessions }))).toEqual({ used: 4, limit: 4 });
	expect(await h.read((tx) => capacityAvailable(tx, { projectId: project, sessions }))).toBe(false);
});
