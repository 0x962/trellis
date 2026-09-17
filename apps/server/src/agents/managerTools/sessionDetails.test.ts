import { expect, test } from "bun:test";
import { managerTools } from "./managerTools.ts";

const id = "01M277VFQA2HAWB58T9NTW4MX5";
const session = {
	id: "attempt",
	pid: 123,
	daemonId: "runtime",
	process: { pid: 123, parentPid: 1 },
	status: "running",
	checkedAt: "2030-01-01T00:00:00Z",
	controllable: true,
	activity: { state: "idle", updatedAt: "2030-01-01T00:00:00Z" },
	result: { id: "result", text: "Full result" },
	error: "Process error",
	exitCode: null,
	acknowledgedMessageIds: ["message"],
	agent: {
		sessionId: "provider",
		turnId: "turn",
		outcome: "completed",
		error: "Agent error",
		tool: { id: "current", name: "Bash", input: { command: "pwd" }, output: "/tmp" },
		lastTool: { id: "last", name: "Read", input: { file: "a.ts" }, output: "x".repeat(5000) },
		lastMessage: { text: "Full message", at: "2030-01-01T00:00:00Z" },
	},
};

test.each(["tool", "lastTool", "lastMessage", "result", "error", "process"])(
	"agent inspection returns only the requested %s detail",
	async (field) => {
		const requests: unknown[] = [];
		const tools = managerTools(async (_operation, input) => {
			requests.push(input);
			return session;
		});
		const result = await tools.call("trellis_agentRuns_session", { id, include: [field] });
		const expected = {
			tool: session.agent.tool,
			lastTool: session.agent.lastTool,
			lastMessage: session.agent.lastMessage,
			result: session.result,
			error: session.agent.error,
			process: {
				attemptId: "attempt",
				pid: 123,
				daemonId: "runtime",
				metadata: session.process,
				sessionId: "provider",
				turnId: "turn",
				acknowledgedMessageIds: ["message"],
				exitCode: null,
			},
		};
		expect(result).toHaveProperty(field, expected[field as keyof typeof expected]);
		for (const other of Object.keys(expected).filter((key) => key !== field)) expect(result).not.toHaveProperty(other);
		expect(requests).toEqual([{ id }]);
	},
);

test("agent inspection advertises and validates optional detail fields", async () => {
	const tools = managerTools(async () => session);
	const schema = tools.list().find((tool) => tool.name === "trellis_agentRuns_session")!.inputSchema;
	expect(schema).toHaveProperty("properties.include");
	await expect(tools.call("trellis_agentRuns_session", { id, include: ["launch"] })).rejects.toThrow();
	const result = await tools.call("trellis_agentRuns_session", { id, include: ["tool", "lastMessage"] });
	expect(result).toMatchObject({ tool: session.agent.tool, lastMessage: session.agent.lastMessage });
});
