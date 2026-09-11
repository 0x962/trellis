import { expect, test } from "bun:test";
import { errors } from "../errors.ts";
import { EventSchema, eventNames } from "../events.ts";
import { contract } from "./index.ts";

test("the public contract exposes ticket workflows without agent orchestration", () => {
	expect(contract).not.toHaveProperty("agents");
	expect(contract).toHaveProperty("tickets");
	expect(contract).toHaveProperty("actors");
	expect(errors).not.toHaveProperty("RUNNER_UNAVAILABLE");
	expect(errors).not.toHaveProperty("CONCURRENCY_LIMIT");
});

test("the event contract rejects retired agent session and batch events", () => {
	expect(eventNames.some((name) => name.startsWith("agents."))).toBe(false);
	expect(
		EventSchema.safeParse({ type: "agents.batch", projectId: "01J8Z6X4Q3M2K1H0G9F8E7D6P1", count: 1 }).success,
	).toBe(false);
});
