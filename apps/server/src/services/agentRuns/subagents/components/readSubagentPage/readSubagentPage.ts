import type { AgentSubagentPage } from "@trellis/api";
import type { RuntimeHarnessObservation, RuntimeOutput } from "@trellis/runtime-protocol";
import { z } from "zod";
import { invalidInput } from "../../../../../errors.ts";
import { projectObservation } from "../projectObservation/index.ts";

export type ReadEvents = (attemptId: string, offset: number) => Promise<RuntimeOutput>;
type Attempt = { id: string };
const cursorSchema = z.object({
	runId: z.string(),
	attemptId: z.string(),
	offset: z.number().int().nonnegative(),
	skipLine: z.boolean(),
	observationIndex: z.number().int().nonnegative(),
});
type Cursor = z.infer<typeof cursorSchema>;
const encode = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");
const json = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
};
const decode = (value: string, runId: string, attempts: Attempt[]) => {
	const parsed = cursorSchema.safeParse(json(Buffer.from(value, "base64url").toString("utf8")));
	if (
		!parsed.success ||
		parsed.data.runId !== runId ||
		!attempts.some((attempt) => attempt.id === parsed.data.attemptId)
	)
		throw invalidInput("after", "The output cursor does not belong to this run.");
	return parsed.data;
};
const observationSchema = z.object({
	observedAt: z.iso.datetime(),
	event: z.object({
		kind: z.string(),
		tool: z
			.object({ id: z.string(), name: z.string(), input: z.unknown().optional(), output: z.unknown().optional() })
			.optional(),
		error: z.string().optional(),
	}),
});

export async function readSubagentPage(
	runId: string,
	provider: string,
	attempts: Attempt[],
	after: string | undefined,
	readEvents: ReadEvents,
	maxReads = 16,
	maxObservations = 200,
): Promise<AgentSubagentPage> {
	let cursor =
		after === undefined
			? { runId, attemptId: attempts[0]?.id ?? "", offset: 0, skipLine: false, observationIndex: 0 }
			: decode(after, runId, attempts);
	const page: AgentSubagentPage = { runId, observations: [], nextCursor: null, hasMore: false, issues: [] };
	if (attempts.length === 0) return page;
	let index = attempts.findIndex((attempt) => attempt.id === cursor.attemptId);
	let reads = 0;
	let visited = 0;
	for (; index < attempts.length && reads < maxReads && visited < 20; index++, visited++) {
		const attempt = attempts[index]!;
		if (cursor.attemptId !== attempt.id)
			cursor = { runId, attemptId: attempt.id, offset: 0, skipLine: false, observationIndex: 0 };
		let pending = Buffer.alloc(0);
		let offset = cursor.offset;
		const pageStart = offset;
		let finished = false;
		while (reads < maxReads) {
			let output: RuntimeOutput;
			reads++;
			try {
				output = await readEvents(attempt.id, offset);
			} catch (error) {
				if ((error as { code?: string }).code !== "SESSION_NOT_FOUND") throw error;
				page.issues.push({ attemptId: attempt.id, reason: "unavailable" });
				finished = true;
				break;
			}
			if (output.startOffset < offset) throw invalidInput("after", "The output cursor exceeds the recorded data.");
			if (output.truncated || output.startOffset !== offset) {
				page.issues.push({ attemptId: attempt.id, reason: "truncated" });
				cursor.offset = output.startOffset;
				cursor.observationIndex = 0;
				cursor.skipLine = false;
				pending = Buffer.alloc(0);
			}
			const bytes = Buffer.from(output.data, "base64");
			if (bytes.length === 0) {
				finished = true;
				break;
			}
			offset = output.nextOffset;
			pending = Buffer.concat([pending, bytes]);
			let end = pending.indexOf(10);
			while (end >= 0) {
				if (cursor.skipLine) cursor.skipLine = false;
				else {
					const parsed = observationSchema.safeParse(json(pending.subarray(0, end).toString("utf8")));
					if (parsed.success) {
						const projected = projectObservation(
							runId,
							attempt.id,
							provider,
							parsed.data as RuntimeHarnessObservation,
						).slice(cursor.observationIndex);
						const selected = projected.slice(0, maxObservations - page.observations.length);
						page.observations.push(...selected);
						if (selected.length < projected.length) {
							cursor.observationIndex += selected.length;
							return { ...page, hasMore: true, nextCursor: encode(cursor) };
						}
					} else page.issues.push({ attemptId: attempt.id, reason: "invalid-record" });
				}
				pending = pending.subarray(end + 1);
				cursor.offset = offset - pending.length;
				cursor.observationIndex = 0;
				if (page.observations.length === maxObservations) return { ...page, hasMore: true, nextCursor: encode(cursor) };
				end = pending.indexOf(10);
			}
		}
		if (finished && pending.length > 0) page.issues.push({ attemptId: attempt.id, reason: "incomplete-record" });
		if (finished && (pending.length === 0 || index + 1 < attempts.length)) {
			if (index + 1 === attempts.length) {
				index = attempts.length;
				break;
			}
			cursor = { runId, attemptId: attempts[index + 1]!.id, offset: 0, skipLine: false, observationIndex: 0 };
			continue;
		}
		if (reads === maxReads) {
			if (pending.length > 0 && cursor.offset === pageStart) {
				page.issues.push({ attemptId: attempt.id, reason: "oversized-record" });
				cursor.offset = offset;
				cursor.skipLine = true;
			}
			page.hasMore = true;
			break;
		}
		if (pending.length > 0) {
			page.hasMore = true;
			break;
		}
	}
	page.hasMore ||= index < attempts.length;
	page.nextCursor = encode(cursor);
	return page;
}
