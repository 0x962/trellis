import { useQuery } from "@tanstack/react-query";
import type { EpicWhiteboardProps } from "@trellis/ui/epic-whiteboard";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { agentProfileOf } from "../../../../agents/agentProfileOf";
import { useSessionStatuses } from "../../../../agents/useSessionStatuses";
import { sessionComposerActions } from "../../../../sessions/sessionComposerStore";

export function useWhiteboardSessions(projectKey: string, readOnly: boolean) {
	const { orpc } = useApp();
	const sessions = useQuery(orpc.sessions.list.queryOptions({ input: {} }));
	const statuses = useSessionStatuses();
	const [placements, setPlacements] = useState<EpicWhiteboardProps["sessionPlacements"]>([]);
	return {
		sessions: (sessions.data ?? []).map((session) => {
			const status = statuses?.[session.id];
			return {
				id: session.runId,
				label: session.name,
				profile: agentProfileOf(session.harness),
				status,
				state:
					status === "starting"
						? ("starting" as const)
						: status === "working"
							? ("working" as const)
							: ("static" as const),
			};
		}),
		error: sessions.error,
		placements,
		placed: (ids: string[]) => setPlacements((pending) => pending.filter((entry) => !ids.includes(entry.runId))),
		create: (point: Parameters<EpicWhiteboardProps["onCreateSession"]>[0]) => {
			if (readOnly) return;
			sessionComposerActions.open(projectKey, {
				onCreated: (session) =>
					setPlacements((pending) => [
						...pending,
						{
							...point,
							runId: session.runId,
							sessionId: session.id,
							label: session.name,
						},
					]),
			});
		},
	};
}
