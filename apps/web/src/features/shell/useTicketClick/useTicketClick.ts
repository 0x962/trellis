import { type LinkPress, toast } from "@trellis/ui";
import { useSessionClickKey } from "../../../hooks/useSessionClickKey";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { allAgentRunsOptions } from "../../agents/allAgentRuns";
import { agentLinesByTicket } from "../../table/utils/agentLines";

let latestClick = 0;

export function useTicketClick(openTicket = pageSheetActions.openTicket) {
	const app = useApp();
	const { consume } = useSessionClickKey();
	return (identifier: string, event: LinkPress) => {
		const click = ++latestClick;
		if (!consume(event)) {
			openTicket(identifier);
			return;
		}
		void app.queryClient
			.fetchQuery({ ...allAgentRunsOptions(app.orpc, app.client, { ticket: identifier }), staleTime: 0 })
			.then((runs) => {
				if (click !== latestClick) return;
				const line = Object.values(agentLinesByTicket(runs))[0];
				if (line) pageSheetActions.openSession(line.runId);
				else openTicket(identifier);
			})
			.catch((error: unknown) => {
				if (click === latestClick) toast.error("Cannot open the session", { description: errorMessage(error) });
			});
	};
}
