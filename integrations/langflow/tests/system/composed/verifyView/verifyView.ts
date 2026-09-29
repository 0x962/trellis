import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { FlowAttemptOutputV1Schema, type FlowExecutionViewV1 } from "@trellis/api";
import type { Scenario } from "../batchInput";
import type { httpClient } from "../httpClient";
import { sameVisit } from "../sameVisit";

export async function verifyView(view: FlowExecutionViewV1, scenario: Scenario, request: ReturnType<typeof httpClient>) {
	assert.equal(view.status, scenario.expectedStatus);
	assert.equal(view.submission?.state, "submitted");
	assert.equal(view.submission?.ownership, "confirmed");
	assert.ok(view.submission?.engineJobId);
	assert.ok(view.stopObligations.every((stop) => stop.state === "confirmed"));
	assert.equal(view.occurrences.length, scenario.expectedOccurrences.length);
	assert.equal(new Set(view.occurrences.map((row) => row.occurrenceKey)).size, view.occurrences.length);
	const nativeAttempts: string[] = [];
	for (const expected of scenario.expectedOccurrences) {
		const rows = view.occurrences.filter((row) => sameVisit(row, expected.visit));
		assert.equal(rows.length, 1, "expected_visit_not_unique");
		const row = rows[0]!;
		assert.equal(row.state, expected.state);
		const parent = expected.parentVisit === null
			? null
			: view.occurrences.filter((item) => sameVisit(item, expected.parentVisit!));
		if (parent !== null) assert.equal(parent.length, 1, "expected_parent_not_unique");
		assert.equal(row.parentOccurrenceKey, parent === null ? null : parent[0]!.occurrenceKey);
		assert.equal(
			row.output === null ? null : createHash("sha256").update(row.output).digest("hex"),
			expected.outputSha256,
		);
		if (!expected.nativeResult) continue;
		assert.equal(row.attempts.length, 1, "native_visit_must_have_one_attempt");
		assert.ok(row.outputSource, "native_output_provenance_required");
		const attempt = row.attempts[0]!;
		assert.equal(attempt.state, "exited");
		assert.ok(attempt.launchedAt);
		assert.ok(attempt.providerSessionId);
		nativeAttempts.push(attempt.attemptId);
		const query = new URLSearchParams(row.outputSource);
		const retained = FlowAttemptOutputV1Schema.parse(
			await request("GET", `/flow-executions/${view.id}/output-v1?${query}`),
		);
		assert.deepEqual(retained, { executionId: view.id, ...row.outputSource, output: row.output });
	}
	assert.equal(new Set(nativeAttempts).size, nativeAttempts.length, "native_attempt_reused_across_visits");
}
