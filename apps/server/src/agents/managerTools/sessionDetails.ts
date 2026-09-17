import type { TrellisClient } from "@trellis/api/client";
import { contract } from "@trellis/api/contract";
import { z } from "zod";

export const sessionInput = contract.agentRuns.session["~orpc"].inputSchema!.extend({
	include: z.array(z.enum(["model", "tool", "lastTool", "lastMessage", "result", "error", "process"])).default([]),
});

type Session = Awaited<ReturnType<TrellisClient["agentRuns"]["session"]>>;
type Field = z.infer<typeof sessionInput>["include"][number];

export const sessionDetails = (session: Session, include: Field[], missingError?: string | null) => {
	const details = {
		model: session?.agent?.model ?? null,
		tool: session?.agent?.tool ?? null,
		lastTool: session?.agent?.lastTool ?? null,
		lastMessage: session?.agent?.lastMessage ?? null,
		result: session?.result ?? null,
		error: session?.agent?.error ?? session?.error ?? missingError ?? null,
		process:
			session === null
				? null
				: {
						attemptId: session.id,
						pid: session.pid,
						daemonId: session.daemonId,
						metadata: session.process,
						sessionId: session.agent?.sessionId ?? null,
						turnId: session.agent?.turnId ?? null,
						acknowledgedMessageIds: session.acknowledgedMessageIds,
						exitCode: session.exitCode,
					},
	};
	return Object.fromEntries(include.map((field) => [field, details[field]]));
};
