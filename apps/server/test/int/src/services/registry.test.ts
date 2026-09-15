import { expect, test } from "bun:test";
import type { Run } from "../../../../src/services/registry.ts";
import type { PrepareCtx } from "../../../../src/services/support.ts";

// The typecheck proves this file, not the test run. A run step holds the
// database lock, so a run step that asks for gh must not fit an `io` entry.
// If it fits, the `@ts-expect-error` below is unused and the typecheck fails.
test("a run step that asks for gh does not fit an io entry", () => {
	// @ts-expect-error: the context of a run step has no gh runner.
	const withGh: Run = async (ctx: PrepareCtx) => ctx.gh;

	expect(typeof withGh).toBe("function");
});
