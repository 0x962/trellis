import { expect, test } from "bun:test";
import { applyTurnActivity } from "./turnActivity.ts";

test("a previous turn cannot unlock native controls for the current turn", () => {
	const current = { turnId: "new", working: true };
	applyTurnActivity(current, { kind: "idle", turnId: "old", outcome: "completed" });
	expect(current).toEqual({ turnId: "new", working: true });
	applyTurnActivity(current, { kind: "session", turnId: "old", model: "old-model" });
	expect(current).toEqual({ turnId: "new", working: true });
	applyTurnActivity(current, { kind: "idle", turnId: "new", outcome: "interrupted" });
	expect(current.working).toBe(false);
});
