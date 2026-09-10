import { useRouterState } from "@tanstack/react-router";
import { Sheet } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { Sidebar } from "../Sidebar";

// The sidebar on a screen under 768 px: a modal sheet from the left edge
// that starts closed. The menu button in the Topbar and in the ticket
// header opens it. A navigation closes it, so a pick in the sheet shows the
// page it names.
export function SidebarSheet() {
	const open = useUiStore((state) => state.sidebarSheetOpen);
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const shown = useRef(pathname);
	useEffect(() => {
		if (shown.current === pathname) return;
		shown.current = pathname;
		uiActions.setSidebarSheetOpen(false);
	}, [pathname]);

	return (
		<Sheet open={open} onOpenChange={uiActions.setSidebarSheetOpen} title="Sidebar" side="left" width={280} bare>
			<Sidebar surface="sheet" />
		</Sheet>
	);
}
