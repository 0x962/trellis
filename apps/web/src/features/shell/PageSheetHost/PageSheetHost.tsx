import { useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { pageSheetActions, usePageSheetStore } from "../../../stores/pageSheetStore";
import { refreshBehindSheet } from "../../../stores/pageSheetStore/refreshBehindSheet";
import { EpicStatisticsSheet } from "./components/EpicStatisticsSheet";
import { PullRequestSheet } from "./components/PullRequestSheet";
import { SessionSheet } from "./components/SessionSheet";
import { TicketSheet } from "./components/TicketSheet";

// The root shell mounts this sheet stack once. It opens one statistics
// sheet, or a ticket with a pull request or a session over it.
//
// A pull request or a session that opens from a ticket renders inside
// `TicketSheet`, because Base UI reads the stack from the React tree. One
// that opens from a list has no ticket under it and renders here.
export function PageSheetHost() {
	const { client, queryClient } = useApp();
	const ticket = usePageSheetStore((state) => state.ticket);
	useEffect(() => {
		pageSheetActions.setRefreshBehindSheet(() => refreshBehindSheet({ client, queryClient }));
		return () => pageSheetActions.setRefreshBehindSheet(null);
	}, [client, queryClient]);
	return (
		<>
			<TicketSheet />
			{ticket === null && <PullRequestSheet />}
			{ticket === null && <SessionSheet />}
			{ticket === null && <EpicStatisticsSheet />}
		</>
	);
}
