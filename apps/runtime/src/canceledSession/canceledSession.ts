import type { SessionRecord } from "../sessionRecord.ts";
import { sessionResources } from "../sessionResources.ts";

export function canceledSession(home: string, daemonId: string, id: string): SessionRecord {
	const now = new Date().toISOString();
	return {
		session: {
			id,
			daemonId,
			pid: null,
			mode: "stdio",
			status: "exited",
			startedAt: now,
			endedAt: now,
			exitCode: null,
			error: "Canceled before launch",
		},
		fingerprint: null,
		identity: null,
		launch: null,
		listeners: new Set(),
		watchedPids: new Set(),
		tokenHash: null,
		activity: null,
		...sessionResources(home, id),
		stopped: Promise.resolve(undefined),
		resolveStop: () => {},
	};
}
