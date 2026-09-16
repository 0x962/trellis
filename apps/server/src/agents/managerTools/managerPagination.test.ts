import { expect, test } from "bun:test";
import { managerTools } from "./managerTools";

const records = Array.from({ length: 76 }, (_, index) => ({
	id: `assignment-${index}`,
	name: `Worker ${index}`,
	runtime: "native",
	kind: "builder",
	projectPath: "TRL",
	ticketIdentifier: `TRL-${index}`,
	terminalId: `attempt-${index}`,
	processStatus: "exited",
	observation: null,
	state: "exited",
	instruction: "Historical assignment instructions. ".repeat(100),
	error: null,
}));

test("manager agent history returns bounded pages with every assignment accessible", async () => {
	const tools = managerTools(async () => records);
	const first = (await tools.call("trellis_agentRuns_list", { project: "TRL" })) as {
		items: typeof records;
		total: number;
		nextOffset: number | null;
	};
	expect(first.items).toHaveLength(10);
	expect(first.total).toBe(76);
	expect(first.nextOffset).toBe(10);
	expect(JSON.stringify(first).length).toBeLessThan(12000);
	const ids = first.items.map((run) => run.id);
	let offset = first.nextOffset;
	while (offset !== null) {
		const page = (await tools.call("trellis_agentRuns_list", { project: "TRL", offset })) as typeof first;
		expect(page.items.length).toBeLessThanOrEqual(10);
		ids.push(...page.items.map((run) => run.id));
		offset = page.nextOffset;
	}
	expect(ids).toEqual(records.map((run) => run.id));
});

test("manager pagination retains ticket filters and omits pagination from API inputs", async () => {
	const requests: unknown[] = [];
	const tools = managerTools(async (operation, input) => {
		requests.push({ operation, input });
		return records;
	});
	const page = (await tools.call("trellis_agentRuns_list", {
		project: "TRL",
		ticket: "TRL-12",
		limit: 2,
		offset: 10,
	})) as { items: typeof records; total: number; nextOffset: number | null };
	expect(page.items.map((run) => run.id)).toEqual(["assignment-10", "assignment-11"]);
	expect(page.nextOffset).toBe(12);
	expect(requests).toEqual([{ operation: "agentRuns.list", input: { project: "TRL", ticket: "TRL-12" } }]);
});

test("manager pagination publishes defaults and rejects an unbounded page before the API call", async () => {
	let requests = 0;
	const tools = managerTools(async () => {
		requests++;
		return records;
	});
	const schema = tools.list().find((tool) => tool.name === "trellis_agentRuns_list")!.inputSchema;
	expect(schema).toMatchObject({
		properties: { limit: { default: 10, maximum: 20 }, offset: { default: 0, minimum: 0 } },
	});
	for (const input of [{ limit: 21 }, { limit: 0 }, { offset: -1 }, { offset: 0.5 }])
		await expect(tools.call("trellis_agentRuns_list", input)).rejects.toThrow();
	expect(requests).toBe(0);
});

test("a page beyond the agent history is empty and has no continuation", async () => {
	const tools = managerTools(async () => records);
	expect(await tools.call("trellis_agentRuns_list", { offset: 100 })).toEqual({
		items: [],
		total: 76,
		nextOffset: null,
	});
});
