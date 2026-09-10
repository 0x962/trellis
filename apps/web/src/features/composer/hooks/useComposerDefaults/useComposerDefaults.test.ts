import { describe, expect, test } from "bun:test";
import { createFakeServer } from "../../../../../test/fake-server";
import { viewOf } from "../../../filters/grammar";
import { composerDefaults } from "./useComposerDefaults";

const server = createFakeServer();
const { statuses } = await server.client.statuses.list({ project: "CDE" });

describe("features/composer/hooks/useComposerDefaults", () => {
	// Outcome 91, T7 (Navid 8). A filter narrows what the list shows. It does
	// not say where a new ticket starts, so a status filter never seeds the
	// status. A single-valued priority filter still seeds the priority.
	test("takes the priority from a single-valued filter, and not the status", () => {
		const view = viewOf({ status: ["agent-review"], priority: ["high"] });
		expect(composerDefaults({ project: "CDE", statuses, view })).toEqual({
			project: "CDE",
			status: "todo",
			priority: "high",
		});
	});

	// Outcome 92. Todo is the default status of the seed. A negated single
	// value is not a single value either.
	test("falls back to the project default status when the filter is not single valued", () => {
		const many = composerDefaults({
			project: "CDE",
			statuses,
			view: viewOf({ status: ["in-progress", "agent-review"] }),
		});
		expect(many.status).toBe("todo");
		expect(many.priority).toBe("none");
		const none = composerDefaults({ project: "CDE", statuses, view: viewOf({}) });
		expect(none.status).toBe("todo");
		expect(none.priority).toBe("none");
		const negated = composerDefaults({ project: "CDE", statuses, view: viewOf({ status: ["done"], not: ["status"] }) });
		expect(negated.status).toBe("todo");
	});

	// The project default is the status marked as default, whatever its
	// category.
	test("uses the status the project marks as default", () => {
		const marked = statuses.map((status) => ({ ...status, isDefault: status.slug === "in-progress" }));
		expect(composerDefaults({ project: "CDE", statuses: marked, view: viewOf({}) }).status).toBe("in-progress");
	});

	// Outcome 93. A group `+` or a board column names the status on purpose.
	test("prefers the group's status when the composer opens from a group", () => {
		const view = viewOf({ status: ["agent-review"] });
		expect(composerDefaults({ project: "CDE", statuses, view, groupStatus: "in-progress" }).status).toBe("in-progress");
	});
});
