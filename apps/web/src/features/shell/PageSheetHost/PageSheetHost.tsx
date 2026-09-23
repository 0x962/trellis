import { useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { pageSheetActions, usePageSheetStore } from "../../../stores/pageSheetStore";
import { refreshBehindSheet } from "../../../stores/pageSheetStore/refreshBehindSheet";
import { BrowserSheet } from "./components/BrowserSheet";
import { ProjectSettingsSheet } from "./components/ProjectSettingsSheet";
import { PullRequestSheet } from "./components/PullRequestSheet";
import { SessionSheet } from "./components/SessionSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { TicketSheet } from "./components/TicketSheet";

// The root shell mounts this sheet stack once. It opens one ticket with a
// pull request or a session over it. The settings, the settings of a
// project, and the in-app browser stand over every one of them.
//
// A pull request or a session that opens from a ticket renders inside
// `TicketSheet`, because Base UI reads the stack from the React tree. One
// that opens from a list has no ticket under it and renders here. Each of
// those sheets draws its own `BrowserSheet` for the same reason, and the one
// here serves a page with no sheet over it.
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
			<SettingsSheet at="page" />
			<ProjectSettingsSheet at="page" />
			<BrowserSheet at="page" />
		</>
	);
}
