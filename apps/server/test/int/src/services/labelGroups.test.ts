import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import * as labelGroups from "../../../../src/services/labelGroups.ts";
import { seedProject } from "../../../fixtures";
import { activityRows, eventsOfType, expectError, type Harness, serviceHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterEach(() => h.read(assertStatusInvariant));
afterAll(() => h.close());

const seed = async (key = "CDE") => {
	const project = await seedProject(h.db, key);
	await h.rebuild();
	return project.rootId;
};

const createGroup = (project: string, name: string) =>
	h.run((ctx, tx) => labelGroups.create(ctx, tx, { project, name }));

const createLabel = (project: string, group: string, name: string, color?: "danger") =>
	h.run((ctx, tx) => labelGroups.createLabel(ctx, tx, { project, group, name, color }));

describe("label groups", () => {
	test("a project lists its groups and labels in creation order", async () => {
		const projectId = await seed();
		const type = await createGroup("CDE", "Type");
		const area = await createGroup("CDE", "Area");
		const bug = await createLabel("CDE", type.id, "Bug", "danger");
		const feature = await createLabel("CDE", type.id, "Feature");

		expect(type).toMatchObject({ projectId, name: "Type", position: 0, labels: [] });
		expect(area).toMatchObject({ projectId, name: "Area", position: 1, labels: [] });
		expect(bug).toMatchObject({ groupId: type.id, name: "Bug", color: "danger", position: 0 });
		expect(feature).toMatchObject({ groupId: type.id, name: "Feature", color: "fg-muted", position: 1 });
		expect(await h.run((ctx, tx) => labelGroups.list(ctx, tx, { project: "CDE" }))).toEqual({
			groups: [{ ...type, labels: [bug, feature] }, area],
		});
	});

	test("names are case-insensitive only within their local scope", async () => {
		await seed("CDE");
		await seed("OPS");
		const cdeType = await createGroup("CDE", "Type");
		await expectError(createGroup("CDE", "type"), "DUPLICATE");
		const opsType = await createGroup("OPS", "Type");
		const area = await createGroup("CDE", "Area");
		await createLabel("CDE", cdeType.id, "Bug");
		await expectError(createLabel("CDE", cdeType.id, "bug"), "DUPLICATE");
		await createLabel("CDE", area.id, "Bug");
		await createLabel("OPS", opsType.id, "Bug");
	});

	test("a project cannot add a label to another project's group", async () => {
		await seed("CDE");
		await seed("OPS");
		const type = await createGroup("CDE", "Type");
		const error = await expectError(createLabel("OPS", type.id, "Bug"), "NOT_FOUND");
		expect(error.data).toEqual({ kind: "label group", ref: type.id });
	});

	test("an archived project rejects both create operations", async () => {
		const projectId = await seed();
		const type = await createGroup("CDE", "Type");
		await h.db.execute(sql`UPDATE projects SET archived_at = now() WHERE id = ${projectId}`);
		await h.rebuild();
		await expectError(createGroup("CDE", "Area"), "PROJECT_ARCHIVED");
		await expectError(createLabel("CDE", type.id, "Bug"), "PROJECT_ARCHIVED");
	});

	test("each create records activity and emits a project-scoped change", async () => {
		const projectId = await seed();
		const type = await createGroup("CDE", "Type");
		const bug = await createLabel("CDE", type.id, "Bug");
		expect(eventsOfType(h.flushed, "labels.changed")).toEqual([
			{ type: "labels.changed", projectId },
			{ type: "labels.changed", projectId },
		]);
		const activity = await activityRows(h);
		expect(activity.map((row) => ({ action: row.action, to: row.to_value, meta: row.meta }))).toEqual([
			{ action: "label-group.created", to: "Type", meta: { groupId: type.id } },
			{ action: "label.created", to: "Bug", meta: { groupId: type.id, labelId: bug.id } },
		]);
	});
});
