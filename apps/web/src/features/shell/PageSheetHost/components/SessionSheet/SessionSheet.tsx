import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { pageSheetActions, usePageSheetStore } from "../../../../../stores/pageSheetStore";
import { SessionConversation } from "../../../../sessions/SessionConversation";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";

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
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ids: [shown ?? ""] } }),
		refetchInterval: 2000,
		enabled: shown !== null,
	});
	const run = runs.data?.[0] ?? null;
	return (
		<PageSheet open={session !== null} onClose={pageSheetActions.closeSession} title={run?.name ?? "Session"}>
			{shown !== null && runs.isError && (
				<EmptyState variant="page" title="The session did not load" description={runs.error.message} />
			)}
			{shown !== null && runs.isSuccess && run === null && (
				<EmptyState variant="page" title="The session is gone" description="Trellis holds no run with this id." />
			)}
			{run !== null && <SessionConversation key={run.id} run={run} />}
		</PageSheet>
	);
}
