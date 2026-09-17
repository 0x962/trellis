import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fromHarnessModel } from "@trellis/api/models";
import type { HarnessEvent, HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export async function preparePi(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	await mkdir(input.configDirectory, { recursive: true });
	const extension = join(input.configDirectory, "trellis-pi.mjs");
	if (input.managerTools)
		await copyFile(
			fileURLToPath(new URL("./managerTools.mjs", import.meta.url)),
			join(input.configDirectory, "managerTools.mjs"),
		);
	await writeFile(
		extension,
		`import { spawn } from "node:child_process";
export default async function(pi) {
 const command = ${JSON.stringify(input.hookCommand)};
 let pending = Promise.resolve();
 for (const event of ["session_start", "input", "agent_start", "agent_end", "message_end", "tool_execution_start", "tool_execution_update", "tool_execution_end", "model_select"]) {
  pi.on(event, (payload, ctx) => {
   const envelope = {harness:"pi",event,sessionId:ctx.sessionManager.getSessionId(),model:ctx.model?.id,payload};
   pending = pending.then(() => new Promise((resolve, reject) => {
   const child = spawn(command, [], {shell:true, stdio:["pipe", "ignore", "pipe"]});
   let error = "";
   child.stderr.on("data", chunk => {error += chunk;});
   child.on("error", reject);
   child.on("close", code => code === 0 ? resolve() : reject(new Error(error || "Trellis hook failed: " + code)));
   child.stdin.end(JSON.stringify(envelope));
   }));
   return pending;
  });
 }
 ${input.managerTools ? `const { registerManagerTools } = await import("./managerTools.mjs"); await registerManagerTools(pi, ${JSON.stringify(input.managerTools)});` : ""}
}
`,
	);
	return {
		executable: "pi",
		args: [
			...(input.managerTools
				? [
						"--system-prompt",
						input.managerSystemPrompt,
						"--append-system-prompt",
						"",
						"--tools",
						"read,bash,edit,write,grep,find,ls",
						"--no-extensions",
						"--no-skills",
						"--no-prompt-templates",
						"--no-context-files",
					]
				: ["--tools", "read,bash,edit,write,grep,find,ls"]),
			"--extension",
			extension,
			...(input.model ? ["--model", input.model] : []),
			...(input.effort ? ["--thinking", input.effort] : []),
			...(input.resume ? ["--session", input.sessionId] : []),
			input.prompt,
		],
		env: {},
	};
}

type PiMessage = {
	role: string;
	stopReason?: string;
	errorMessage?: string;
	content?: { type: string; text?: string }[];
};
type PiEnvelope = {
	event: string;
	sessionId?: string;
	model?: string;
	payload: {
		text?: string;
		messages?: PiMessage[];
		message?: PiMessage;
		toolCallId?: string;
		toolName?: string;
		args?: unknown;
		result?: unknown;
		partialResult?: unknown;
		model?: { id: string };
	};
};
export function parsePiEvent(envelope: PiEnvelope): HarnessEvent[] {
	const { event, payload } = envelope;
	const identity = {
		...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
		...(envelope.model ? { model: fromHarnessModel("pi", envelope.model) } : {}),
	};
	if (event === "session_start" || event === "model_select")
		return [
			{ kind: "session", ...identity, ...(payload.model ? { model: fromHarnessModel("pi", payload.model.id) } : {}) },
		];
	if (event === "input") return [{ kind: "prompt", ...identity, prompt: payload.text }];
	if (event === "agent_start") return [{ kind: "working", ...identity }];
	if (event === "message_end" && payload.message?.role === "assistant") {
		const text = payload.message.content
			?.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		return text ? [{ kind: "message", ...identity, message: { text } }] : [];
	}
	if (event === "agent_end") {
		const assistant = payload.messages?.findLast((message) => message.role === "assistant");
		if (assistant?.stopReason === "error")
			return [
				{ kind: "error", ...identity, error: assistant.errorMessage, outcome: "failed" },
				{ kind: "idle", ...identity, outcome: "failed" },
			];
		const result =
			assistant?.stopReason === "aborted"
				? undefined
				: assistant?.content
						?.filter((part) => part.type === "text")
						.map((part) => part.text)
						.join("\n");
		return [
			{
				kind: "idle",
				...identity,
				...(result ? { result } : {}),
				outcome: assistant?.stopReason === "aborted" ? "interrupted" : "completed",
			},
		];
	}
	const kind = {
		tool_execution_start: "tool-start",
		tool_execution_update: "tool-update",
		tool_execution_end: "tool-end",
	} as const;
	if (event in kind)
		return [
			{
				kind: kind[event as keyof typeof kind],
				...identity,
				tool: {
					id: payload.toolCallId!,
					name: payload.toolName!,
					...(payload.args !== undefined ? { input: payload.args } : {}),
					...(payload.result !== undefined || payload.partialResult !== undefined
						? { output: payload.result ?? payload.partialResult }
						: {}),
				},
			},
		];
	return [];
}
