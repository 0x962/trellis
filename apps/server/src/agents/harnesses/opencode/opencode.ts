import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import type { HarnessEvent, HarnessLaunch, HarnessLaunchInput } from "../types.ts";

const envelope = z.object({
	event: z.enum(["session", "prompt", "working", "idle", "tool-start", "tool-update", "tool-end", "error"]),
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
	return [{ kind: event, ...fields }];
};
export const openCodeInterrupt = "\u001b";
export const prepareOpenCode = async (input: HarnessLaunchInput): Promise<HarnessLaunch> => {
	await mkdir(input.configDirectory, { recursive: true, mode: 0o700 });
	const plugin = join(input.configDirectory, "trellis-opencode.mjs");
	await copyFile(fileURLToPath(new URL("./plugin.mjs", import.meta.url)), plugin);
	const args: string[] = [];
	if (input.model !== undefined) args.push("--model", input.model);
	if (input.resume) {
		args.push("--session", input.sessionId);
	}
	args.push("--prompt", input.prompt);
	return {
		executable: "opencode",
		args,
		env: {
			OPENCODE_DISABLE_AUTOUPDATE: "1",
			OPENCODE_PERMISSION: JSON.stringify({ "*": "allow" }),
			OPENCODE_CONFIG_CONTENT: JSON.stringify({
				autoupdate: false,
				permission: "allow",
				plugin: [pathToFileURL(plugin).href],
			}),
			TRELLIS_HARNESS_HOOK: input.hookCommand,
			TRELLIS_PROVIDER_SESSION: input.resume ? input.sessionId : "",
		},
	};
};
