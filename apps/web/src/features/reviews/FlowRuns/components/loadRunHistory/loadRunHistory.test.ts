import { expect, test } from "bun:test";
import type { FlowExecutionIdentityV1, TrellisClient } from "@trellis/api";
import { loadRunHistory } from "./loadRunHistory";

test("reads beyond 500 runs and propagates cancellation to every page", async () => {
	const offsets: number[] = [];
	const controller = new AbortController();
	const records: FlowExecutionIdentityV1[] = Array.from({ length: 501 }, (_, index) => ({
		id: `execution-${index}`,
		engine: index % 2 === 0 ? "langflow" : "legacy",
		flowId: "00000000000000000000000001",
		status: "succeeded",
		pendingSubmission: false,
	}));
	const client = {
		flowDocumentsV1: {
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
	expect(result[0]?.engine).toBe("langflow");
	expect(result[1]?.engine).toBe("legacy");
	expect(offsets).toEqual([0, 100, 200, 300, 400, 500]);
});
