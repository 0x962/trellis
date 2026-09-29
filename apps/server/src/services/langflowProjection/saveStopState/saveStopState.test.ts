import { afterEach, expect, test } from "bun:test";
import {
	commitProjection,
	readExecution,
	readProjection,
	readProjectionFacts,
} from "../../../db/queries/langflowExecution";
import { ids, now } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { handle } from "../../../db/queries/langflowExecution/fixtures/native";
import { cancelView } from "../../langflowStops/cancelView";
import { drainStops } from "../../langflowStops/drainStops";
import { stopFixture } from "../../langflowStops/testFixture";
import { saveStopState } from "./saveStopState";

let fixture: Awaited<ReturnType<typeof stopFixture>>;
afterEach(async () => {
	await fixture.db.$client.close();
});
const input = { executionId: ids.execution };

test("cancel returns the persisted view and repeats without a new revision", async () => {
	fixture = await stopFixture(true);
	const before = fixture.view;
	const view = await fixture.run((tx) => cancelView(fixture.core, tx, { id: ids.execution, expectedRevision: 1 }));
	expect(view.status).toBe("canceled");
	expect(view.detail).toBe("canceled");
	expect(view.revision).toBe(2);
	expect(view.stopObligations[0]!.state).toBe("pending");
	expect(view.snapshot).toEqual(before.snapshot);
	expect(view.publication).toEqual(before.publication);
	expect(view.occurrences).toEqual(before.occurrences);
	expect(view.lastEventSeq).toBe(before.lastEventSeq);
	expect(view.decisionDeliveries).toEqual(before.decisionDeliveries);
	expect((await fixture.run((tx) => readProjection(tx, input)))!.view).toEqual(view);
	expect(await fixture.run((tx) => cancelView(fixture.core, tx, { id: ids.execution, expectedRevision: 2 }))).toEqual(
		view,
	);
	await drainStops(fixture.io, input, {
		stop: async () => ({
			id: handle.attemptId,
			daemonId: "runtime",
			pid: null,
			mode: "pty",
			status: "exited",
			startedAt: now.toISOString(),
			endedAt: now.toISOString(),
			exitCode: 0,
			error: null,
		}),
	});
	const confirmed = (await fixture.run((tx) => readProjection(tx, input)))!.view;
	expect(confirmed.status).toBe("canceled");
	expect(confirmed.stopObligations[0]!.state).toBe("confirmed");
	expect(confirmed.revision).toBe(3);
	expect(await fixture.run((tx) => saveStopState(fixture.core, tx, input))).toEqual(confirmed);
}, 60_000);

test("cancel plus projection rollback leaves no partial cancellation", async () => {
	fixture = await stopFixture();
	await expect(
		fixture.run(async (tx) => {
			await cancelView(fixture.core, tx, { id: ids.execution, expectedRevision: 1 });
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect((await fixture.run((tx) => readExecution(tx, input)))!.cancelIntent).toBeNull();
	expect((await fixture.run((tx) => readProjection(tx, input)))!.view).toEqual(fixture.view);
	expect((await fixture.run((tx) => readProjectionFacts(tx, input))).stops).toEqual([]);
}, 60_000);

test("stop facts retain genuine failure details", async () => {
	fixture = await stopFixture();
	const failed = {
		...fixture.view,
		status: "failed" as const,
		detail: "failed" as const,
		failureKind: "error" as const,
		error: "engine unavailable",
		revision: 2,
	};
	await fixture.run((tx) =>
		commitProjection(tx, { ...input, expectedRevision: 1, view: failed, event: null, sourceBytes: null }),
	);
	expect(await fixture.run((tx) => saveStopState(fixture.core, tx, input))).toEqual({
		...failed,
		revision: 3,
		updatedAt: now.toISOString(),
		deadlines: [
			{
				deadlineId: "deadline-1",
				groupOccurrenceKey: "outer.501",
				launchedAt: null,
				deadlineAt: null,
			},
		],
	});
}, 60_000);
