import type { HarnessSnapshot } from "./types.ts";

export const renderTranscript = (snapshot: HarnessSnapshot) =>
	[...snapshot.transcript.map((message) => `${message.role}: ${message.text}`), snapshot.result, snapshot.error]
		.filter(Boolean)
		.join("\n\n");
