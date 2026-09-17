import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fromHarnessModel } from "@trellis/api/models";
import { z } from "zod";
import type { HarnessEvent, HarnessLaunch, HarnessLaunchInput } from "../types.ts";

const envelope = z.object({
	event: z.enum(["session", "prompt", "working", "idle", "message", "tool-start", "tool-update", "tool-end", "error"]),
	message: z.object({ text: z.string() }).optional(),
	sessionId: z.string(),
	turnId: z.string().optional(),
	model: z.string().optional(),
	prompt: z.string().optional(),
	result: z.string().optional(),
	tool: z
		.object({ id: z.string(), name: z.string(), input: z.unknown().optional(), output: z.unknown().optional() })
		.optional(),
	error: z.string().optional(),
	outcome: z.enum(["completed", "interrupted", "failed"]).optional(),
});
export const parseOpenCodeEvent = (payload: unknown): HarnessEvent[] => {
	const { event, ...fields } = envelope.parse(payload);
	return [{ kind: event, ...fields, ...(fields.model ? { model: fromHarnessModel("opencode", fields.model) } : {}) }];
};
export const prepareOpenCode = async (input: HarnessLaunchInput): Promise<HarnessLaunch> => {
	await mkdir(input.configDirectory, { recursive: true, mode: 0o700 });
	const plugin = join(input.configDirectory, "trellis-opencode.mjs");
	await copyFile(fileURLToPath(new URL("./plugin.mjs", import.meta.url)), plugin);
	await copyFile(fileURLToPath(new URL("./control.mjs", import.meta.url)), join(input.configDirectory, "control.mjs"));
	const args: string[] = input.managerTools ? ["--agent", "trellis-manager"] : [];
	const permission = { "*": "allow" };
	if (input.model !== undefined) args.push("--model", input.model);
	if (input.resume) {
		args.push("--session", input.sessionId);
	}
	if (!input.resume) args.push("--prompt", input.prompt);
	return {
		executable: "opencode",
		args,
		env: {
			OPENCODE_DISABLE_AUTOUPDATE: "1",
			OPENCODE_PERMISSION: JSON.stringify(permission),
			...(input.managerTools
				? {
						TRELLIS_MANAGER_TOOLS: JSON.stringify(input.managerTools),
						TRELLIS_MANAGER_SYSTEM_PROMPT: input.managerSystemPrompt,
						OPENCODE_DISABLE_PROJECT_CONFIG: "1",
					}
				: {}),
			OPENCODE_CONFIG_CONTENT: JSON.stringify({
				autoupdate: false,
				...(input.effort && !input.managerTools
					? { agent: { build: { model: input.model, variant: input.effort } } }
					: {}),
				permission: input.managerTools ? permission : "allow",
				...(input.managerTools
					? {
							default_agent: "trellis-manager",
							agent: {
								"trellis-manager": {
									mode: "primary",
									permission,
									prompt: input.managerSystemPrompt,
									model: input.model,
									variant: input.effort,
								},
							},
							mcp: {
								trellis: {
									type: "local",
									command: [input.managerTools.command, ...input.managerTools.args],
									enabled: true,
								},
							},
						}
					: {}),
				plugin: [pathToFileURL(plugin).href],
			}),
			TRELLIS_HARNESS_HOOK: input.hookCommand,
			TRELLIS_OPENCODE_CONTROL_SOCKET: `/tmp/trellis-oc-${randomUUID()}.sock`,
			TRELLIS_OPENCODE_CONTROL_TOKEN: randomUUID(),
			...(input.model ? { TRELLIS_OPENCODE_MODEL: input.model } : {}),
			...(input.effort ? { TRELLIS_OPENCODE_VARIANT: input.effort } : {}),
			TRELLIS_PROVIDER_SESSION: input.resume ? input.sessionId : "",
		},
	};
};
