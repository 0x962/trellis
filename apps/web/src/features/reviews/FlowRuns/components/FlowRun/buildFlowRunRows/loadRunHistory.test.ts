import { expect, test } from "bun:test";
import type { FlowExecutionRecord, TrellisClient } from "@trellis/api";
import { loadRunHistory } from "./loadRunHistory";

test("reads beyond 500 runs and propagates cancellation to every page", async () => {
	const offsets: number[] = [];
	const controller = new AbortController();
	const records = Array.from({ length: 501 }, (_, index) => ({ id: `execution-${index}` })) as FlowExecutionRecord[];
	const client = {
		flowExecutions: {
			list: async (input: { offset: number; limit: number }, options: { signal: AbortSignal }) => {
				offsets.push(input.offset);
				expect(options.signal).toBe(controller.signal);
				return records.slice(input.offset, input.offset + input.limit);
			},
		},
	} as unknown as TrellisClient;
	const result = await loadRunHistory(client, "diff", controller.signal);
	expect(result).toHaveLength(501);
	expect(result.at(-1)?.id).toBe("execution-500");
	expect(offsets).toEqual([0, 100, 200, 300, 400, 500]);
});
