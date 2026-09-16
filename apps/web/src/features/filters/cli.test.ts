import { describe, expect, test } from "bun:test";
import { parseCli, toCli } from "./cli";
import { parseSearch, toListQuery } from "./grammar";

// The plan's example, identical on the three surfaces. The route adds the
// project to the query the URL parses to.
const view = parseSearch({ status: "in-progress,agent-review", parent: "none", ci: "fail", sort: "-updatedAt" });
const query = { project: "CDE", ...toListQuery(view) };
const command =
	"trellis list --project CDE --status in-progress,agent-review --parent none --ci fail --sort -updatedAt --no-subprojects";

describe("features/filters/cli", () => {
	// Outcome 73
	test("emits the plan's exact trellis list command", () => {
		expect(toCli(query)).toBe(command);
	});

	// Outcome 74
	test("parses the CLI command back into the same query", () => {
		expect(parseCli(command)).toEqual(query);
		expect(parseCli(toCli(query))).toEqual(query);
	});
});
