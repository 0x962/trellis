import { z } from "zod";

const sessions = z.array(
	z.looseObject({
		sessionId: z.string().optional(),
		pid: z.number().optional(),
		status: z.string().optional(),
		waitingFor: z.unknown().optional(),
	}),
);

export function parseClaudeStatus(payload: unknown, target: { sessionId: string; pid: number }) {
	const session = sessions
		.parse(payload)
		.find((item) => item.sessionId === target.sessionId && item.pid === target.pid);
	if (!session?.status) return null;
	return { status: session.status, ...(session.waitingFor !== undefined ? { waitingFor: session.waitingFor } : {}) };
}
