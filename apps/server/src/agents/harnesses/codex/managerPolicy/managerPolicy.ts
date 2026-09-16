import { z } from "zod";

export const managerPolicy = {
	config: {
		"features.shell_tool": false,
		"features.unified_exec": false,
		"features.apps": false,
		"features.plugins": false,
		"features.codex_hooks": false,
		"features.plugin_hooks": false,
		"features.multi_agent": false,
		"features.multi_agent_v2": false,
		"agents.enabled": false,
		web_search: "disabled",
		"features.browser_use": false,
		"features.computer_use": false,
		"features.image_generation": false,
		"features.goals": false,
		"features.memories": false,
		"features.memory_tool": false,
		"features.js_repl": false,
		"features.view_image": false,
		"features.skill_search": false,
		"features.tool_suggest": false,
		"features.skip_host_skill_discovery": true,
		"orchestrator.skills.enabled": false,
		"orchestrator.mcp.enabled": false,
		"skills.include_instructions": false,
		project_doc_max_bytes: 0,
	},
	terminalRequest(
		message: unknown,
		input: { threadId: string; systemPrompt: string; config: Record<string, unknown> },
	) {
		const value = z
			.looseObject({ method: z.string().optional(), params: z.record(z.string(), z.unknown()).optional() })
			.parse(message);
		const params = value.params ?? {};
		if (value.method === "turn/start") value.params = { ...params, ...managerPolicy.turn, threadId: input.threadId };
		if (value.method === "thread/resume")
			value.params = {
				...params,
				threadId: input.threadId,
				baseInstructions: input.systemPrompt,
				developerInstructions: "",
				config: input.config,
				approvalPolicy: "never",
				sandbox: "read-only",
			};
		return value;
	},
	turn: { environments: [], approvalPolicy: "never", sandboxPolicy: { type: "readOnly" } },
};
