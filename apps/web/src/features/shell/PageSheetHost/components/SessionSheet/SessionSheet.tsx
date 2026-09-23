import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@trellis/ui";
import { useRef } from "react";
import { useApp } from "../../../../../lib/appContext";
import { pageSheetActions, usePageSheetStore } from "../../../../../stores/pageSheetStore";
import { SessionConversation } from "../../../../sessions/SessionConversation";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";
import { BrowserSheet } from "../BrowserSheet";
import { ProjectSettingsSheet } from "../ProjectSettingsSheet";
import { SettingsSheet } from "../SettingsSheet";

const sheetOpenMotionMs = () =>
	Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--duration-peek"));

// The session of one agent run, in a `PageSheet` over the page that opened
// it. The store holds the id of the run, and this query reads the run that
// `SessionConversation` draws.
//
// The sheet stays mounted while it is closed. A sheet that mounts open skips
// its slide, so the first session would appear with no motion.
export function SessionSheet() {
	const { orpc } = useApp();
	const session = usePageSheetStore((state) => state.session);
	const shown = useShown(session);
	const openedAt = useRef(performance.now());
	const previousSession = useRef(session);
	if (session !== previousSession.current) {
		previousSession.current = session;
		if (session !== null) openedAt.current = performance.now();
	}
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ids: [shown ?? ""] } }),
		refetchInterval: 2000,
		enabled: shown !== null,
	});
	const run = runs.data?.[0] ?? null;
	const terminalFocusDelay = Math.max(0, sheetOpenMotionMs() - (performance.now() - openedAt.current));
	return (
		<PageSheet
			open={session !== null}
			onClose={pageSheetActions.closeSession}
			onReturn={pageSheetActions.returnToSession}
			title={run?.name ?? "Session"}
		>
			{shown !== null && runs.isError && (
				<EmptyState variant="page" title="The session did not load" description={runs.error.message} />
			)}
			{shown !== null && runs.isSuccess && run === null && (
				<EmptyState variant="page" title="The session is gone" description="Trellis holds no run with this id." />
			)}
			{run !== null && (
				<SessionConversation key={run.id} run={run} autoFocusTerminal autoFocusTerminalDelay={terminalFocusDelay} />
			)}
			<SettingsSheet at="session" />
			<ProjectSettingsSheet at="session" />
			<BrowserSheet at="session" />
		</PageSheet>
	);
}
