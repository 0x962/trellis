import { expect, test } from "bun:test";
import type { GroupDeadlineV1, NativeLaunchReceiptV1 } from "../../langflowContracts";
import { earliestDeadline } from "./earliestDeadline";
import { startDeadline } from "./startDeadline";
import { timeWarning } from "./timeWarning";

const reserved: GroupDeadlineV1 = {
	deadlineId: "deadline-1",
	groupOccurrenceKey: "group:loop:1",
	budgetMs: 120_000,
	launchedAt: null,
	deadlineAt: null,
	launchReceiptId: null,
};
const launch: NativeLaunchReceiptV1 = {
	version: 1,
	launchReceiptId: "launch-1",
	stepId: "step-1",
	attemptId: "00000000-0000-4000-8000-000000000001",
	launchedAt: "2026-09-29T06:01:00.000Z",
	recordedAt: "2026-09-29T06:02:00.000Z",
	groupDeadlines: [],
};
const started = startDeadline(reserved, launch);
const warningInput = {
	executionId: "execution-1",
	attemptId: launch.attemptId,
	deadlines: [started],
	acknowledgedMessageIds: [launch.attemptId],
	now: new Date("2026-09-29T06:02:00.000Z"),
};

test("a reserved group has no deadline", () => {
	expect(earliestDeadline([reserved])).toBeNull();
});

test("a delayed receipt uses the launch time", () => {
	expect(started.deadlineAt).toBe("2026-09-29T06:03:00.000Z");
	expect(started.launchedAt).toBe(launch.launchedAt);
	expect(started.launchReceiptId).toBe(launch.launchReceiptId);
});

test("a delayed process spawn delays the deadline independently from the receipt", () => {
	const delayed = { ...launch, launchedAt: "2026-09-29T06:05:00.000Z", recordedAt: "2026-09-29T06:10:00.000Z" };
	expect(startDeadline(reserved, delayed).deadlineAt).toBe("2026-09-29T06:07:00.000Z");
});

test("restart and another launch keep the original deadline", () => {
	const restored = JSON.parse(JSON.stringify(started)) as GroupDeadlineV1;
	expect(startDeadline(restored, { ...launch, launchedAt: "2026-09-29T08:00:00.000Z" })).toEqual(started);
});

test("nested groups preserve the earliest ancestor limit", () => {
	const outer = startDeadline({ ...reserved, deadlineId: "outer", budgetMs: 60_000 }, launch);
	expect(earliestDeadline([started, outer])).toEqual(outer);
	expect(earliestDeadline([outer, started])).toEqual(outer);
});

test("each loop occurrence retains a separate clock", () => {
	const next = startDeadline(
		{ ...reserved, deadlineId: "deadline-2", groupOccurrenceKey: "group:loop:2" },
		{
			...launch,
			launchedAt: "2026-09-29T07:00:00.000Z",
		},
	);
	expect(next.deadlineAt).toBe("2026-09-29T07:02:00.000Z");
	expect(started.deadlineAt).toBe("2026-09-29T06:03:00.000Z");
});

test("a user budget above one day remains complete", () => {
	const long = startDeadline({ ...reserved, budgetMs: 1441 * 60_000 }, launch);
	expect(Date.parse(long.deadlineAt!) - Date.parse(launch.launchedAt)).toBe(1441 * 60_000);
});

test("warnings wait for the exact initial prompt receipt", () => {
	expect(timeWarning({ ...warningInput, acknowledgedMessageIds: [] })).toBeNull();
	expect(timeWarning({ ...warningInput, acknowledgedMessageIds: ["another-attempt"] })).toBeNull();
});

test("the half warning keeps its ID and bytes after a restart", () => {
	const half = timeWarning(warningInput)!;
	const later = timeWarning({ ...warningInput, now: new Date("2026-09-29T06:02:10.000Z") });
	expect(later).toEqual(half);
	expect(half.text).toContain("half-time");
	expect(half.text).toContain(started.deadlineAt!);
	expect(timeWarning({ ...warningInput, acknowledgedMessageIds: [launch.attemptId, half.messageId] })).toBeNull();
});

test("the quarter warning has a separate stable ID", () => {
	const half = timeWarning(warningInput)!;
	const quarter = timeWarning({
		...warningInput,
		now: new Date("2026-09-29T06:02:30.000Z"),
		acknowledgedMessageIds: [launch.attemptId, half.messageId],
	})!;
	expect(quarter.messageId).not.toBe(half.messageId);
	expect(quarter.text).toContain("quarter-time");
});

test("warnings stop at expiry and do not start before half of the budget", () => {
	for (const at of ["2026-09-29T06:01:59.000Z", "2026-09-29T06:03:00.000Z"])
		expect(timeWarning({ ...warningInput, now: new Date(at) })).toBeNull();
});

test("warning identities distinguish executions, attempts, and group occurrences", () => {
	const first = timeWarning(warningInput)!;
	const nextAttempt = "00000000-0000-4000-8000-000000000002";
	const variants = [
		{ ...warningInput, executionId: "execution-2" },
		{ ...warningInput, attemptId: nextAttempt, acknowledgedMessageIds: [nextAttempt] },
		{ ...warningInput, deadlines: [{ ...started, deadlineId: "deadline-2" }] },
	];
	for (const input of variants) expect(timeWarning(input)!.messageId).not.toBe(first.messageId);
});
