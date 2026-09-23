import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { parseProjectSplat } from "../../lib/projectUrl";

// The name of the page at `pathname`, or null for a page with no name of
// its own.
const pageName = (pathname: string): string | null => {
	if (pathname === "/needs-you") return "Needs you";
	// The desktop app draws the settings at this URL before the first run.
	// Every other visit opens the settings sheet and lands on another page.
	if (pathname === "/settings") return "Settings";
	if (pathname === "/search") return "Search";
	if (pathname.startsWith("/p/")) {
		const { ref, view } = parseProjectSplat(pathname.slice(3));
		const path = ref.split(".").join(" › ");
		if (view === "diffs") return `${path} › Diffs`;
		return path;
	}
	return null;
};

// The tab title of a page: "Needs you · trellis". A ticket page and a
// session page set their own titles from the record they read, so they get
// null here.
export const documentTitle = (pathname: string): string | null => {
	if (pathname.startsWith("/t/") || pathname.startsWith("/sessions/")) return null;
	const name = pageName(pathname);
	return name === null ? "trellis" : `${name} · trellis`;
};

export const useDocumentTitle = () => {
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const title = documentTitle(pathname);

	useEffect(() => {
		if (title !== null) document.title = title;
	}, [title]);
};
