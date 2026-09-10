import { describe, expect, test } from "bun:test";
import { createFakeServer } from "../../../../../test/fake-server";
import { viewOf } from "../../../filters/grammar";
import { composerDefaults } from "./useComposerDefaults";

const server = createFakeServer();
const { statuses } = await server.client.statuses.list({ project: "CDE" });

describe("features/composer/hooks/useComposerDefaults", () => {
	// Outcome 91
	test("takes the status and priority from a single-valued filter", () => {
		const view = viewOf({ status: ["agent-review"], priority: ["high"] });
		expect(composerDefaults({ project: "CDE", statuses, view })).toEqual({
			project: "CDE",
			status: "agent-review",
			priority: "high",
		});
	});

	// Outcome 92. Todo is the first todo-category status of the seed. A
	// negated single value is not a single value either.
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

	// Outcome 93
	test("prefers the group's status when the composer opens from a group", () => {
		const view = viewOf({ status: ["agent-review"] });
		expect(composerDefaults({ project: "CDE", statuses, view, groupStatus: "in-progress" }).status).toBe("in-progress");
	});
});
