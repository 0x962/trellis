import type { AnyRouter } from "@tanstack/react-router";

export const backNavigation = (router: Pick<AnyRouter, "history" | "navigate">) => {
	if (router.history.canGoBack()) {
		router.history.back();
		return;
	}
	if (router.history.location.pathname === "/setup") return;
	// A direct link has no previous app entry. Replace it to keep Back inside Trellis.
	if (router.history.location.href !== "/needs-you") {
		return router.navigate({ to: "/needs-you", replace: true });
	}
};
