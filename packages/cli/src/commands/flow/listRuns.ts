import type { FlowExecutionListInput } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { readRun } from "./readRun/readRun.ts";
import { readV1 } from "./readV1/readV1.ts";
import type { ListedRun } from "./runRow/runRow.ts";

export const listRuns = async (client: TrellisClient, input: Omit<FlowExecutionListInput, "limit" | "offset">) => {
	const found: ListedRun[] = [];
	for (let offset = 0; ; offset += 500) {
		const page = await client.flowDocumentsV1.list({ ...input, limit: 500, offset });
		for (const item of page) {
			const identity = readV1.identity(item);
			found.push(identity.status === null ? identity : await readRun(client, identity.id, identity.engine));
		}
		if (page.length < 500) return found;
	}
};
