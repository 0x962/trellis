import { z } from "zod";
import { selectConversationFiles } from "../../conversationExport/select";
import type { ConversationAdapter } from "../../conversationExport/types";

const record = z.object({ stream: z.object({ id: z.string() }) });
const frame = z.object({ children: z.array(z.object({ record_json: z.string() })) });

function identifies(value: unknown, sessionId: string): "match" | "other" | "none" {
	const parsed = record.safeParse(value);
	if (parsed.success) return parsed.data.stream.id === sessionId ? "match" : "other";
	const nested = frame.safeParse(value);
	if (!nested.success) return "none";
	const results = nested.data.children.map((child) => identifies(JSON.parse(child.record_json), sessionId));
	return results.includes("other") ? "other" : results.includes("match") ? "match" : "none";
}

export const museConversationExport: ConversationAdapter = {
	encoding: "jsonl",
	select: (identity, inventory) =>
		selectConversationFiles(
			inventory,
			(path) => path.endsWith(`/${identity.providerSessionId}/session.jsonl`),
			(path, transcript) => path.startsWith(transcript.slice(0, -"session.jsonl".length)),
		),
	identifies,
};
