import type { HarnessEvent, HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export const agyCapabilityGaps = [
	"AGY cannot load per-attempt hooks without a change to the workspace, global configuration, or primary working directory.",
	"AGY interrupt can cancel its Stop hook before the hook confirms idle.",
] as const;

export async function prepareAgy(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	if (input.resume && !input.sessionId) throw new Error("AGY resume requires an exact conversation ID.");
	return {
		executable: "agy",
		args: [
			"--dangerously-skip-permissions",
			...(input.model ? ["--model", input.model] : []),
			...(input.resume ? ["--conversation", input.sessionId!] : []),
			"--prompt-interactive",
			input.prompt,
		],
		env: {},
	};
}

type TranscriptEntry = { source: string; type: string; content: string };
type AgyEnvelope = {
	event: string;
	payload: {
		conversationId?: string;
		modelName?: string;
		fullyIdle?: boolean;
		error?: string;
		stepIdx?: number;
		toolCall?: { name: string; args: unknown } | null;
	};
	transcript?: TranscriptEntry[];
};
export function parseAgyEvent({ event, payload, transcript }: AgyEnvelope): HarnessEvent[] {
	const identity = {
		...(payload.conversationId ? { sessionId: payload.conversationId } : {}),
		...(payload.modelName ? { model: payload.modelName } : {}),
	};
	if (event === "PreInvocation") {
		const user = transcript?.findLast((entry) => entry.source === "USER_EXPLICIT" && entry.type === "USER_INPUT");
		const prompt = user?.content.match(/^<USER_REQUEST>\r?\n([\s\S]*?)\r?\n<\/USER_REQUEST>/)?.[1];
		return [
			{ kind: "session", ...identity },
			...(prompt ? [{ kind: "prompt" as const, ...identity, prompt }] : []),
			{ kind: "working", ...identity },
		];
	}
	if (event === "Stop") {
		const events: HarnessEvent[] = payload.error ? [{ kind: "error", ...identity, error: payload.error }] : [];
		if (payload.fullyIdle) {
			const result = payload.error
				? undefined
				: transcript
						?.slice(
							transcript.findLastIndex((entry) => entry.source === "USER_EXPLICIT" && entry.type === "USER_INPUT") + 1,
						)
						.findLast((entry) => entry.source === "MODEL" && entry.type === "PLANNER_RESPONSE")?.content;
			events.push({ kind: "idle", ...identity, ...(result ? { result } : {}) });
		}
		return events;
	}
	if ((event === "PreToolUse" || event === "PostToolUse") && payload.toolCall)
		return [
			{
				kind: event === "PreToolUse" ? "tool-start" : "tool-end",
				...identity,
				tool: {
					id: String(payload.stepIdx),
					name: payload.toolCall.name,
					input: payload.toolCall.args,
					...(payload.error ? { output: { error: payload.error } } : {}),
				},
			},
		];
	return [];
}
