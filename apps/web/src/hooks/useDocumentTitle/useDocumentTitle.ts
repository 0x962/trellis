import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { needsYouCount } from "../../features/needs-you/utils/needsYouCount";
import { useApp } from "../../lib/appContext";
import { formatCount } from "../../lib/format";
import { parseProjectSplat } from "../../lib/projectPath";

// The name of the page at `pathname`, or null for a page with no name of
// its own.
const pageName = (pathname: string, needsYou: number): string | null => {
	if (pathname === "/needs-you") return needsYou > 0 ? `Needs you (${formatCount(needsYou)})` : "Needs you";
	if (pathname === "/all" || pathname.startsWith("/all/")) return "All tickets";
	if (pathname === "/settings") return "Settings";
	if (pathname === "/search") return "Search";
	if (pathname.startsWith("/p/")) {
		const { ref, view } = parseProjectSplat(pathname.slice(3));
		const path = ref.split(".").join(" › ");
		return view === "settings" ? `${path} › Settings` : path;
	}
	return null;
};

// The tab title of a page: "All tickets · trellis". A ticket page sets its
// own title from the ticket it reads, so it gets null here.
export const documentTitle = (pathname: string, needsYou: number): string | null => {
	if (pathname.startsWith("/t/")) return null;
	const name = pageName(pathname, needsYou);
	return name === null ? "trellis" : `${name} · trellis`;
};

// Keeps the tab title on the page the outlet shows. The Needs you count
// comes from the same inbox query as the sidebar badge.
export const useDocumentTitle = (enabled: boolean) => {
	const { orpc } = useApp();
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const inbox = useQuery({ ...orpc.inbox.get.queryOptions({ input: {} }), enabled });
	const needsYou = inbox.data === undefined ? 0 : needsYouCount(inbox.data);
	const title = documentTitle(pathname, needsYou);

	useEffect(() => {
		if (title !== null) document.title = title;
	}, [title]);
};
