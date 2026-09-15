import { useRouterState } from "@tanstack/react-router";
import { Sheet } from "@trellis/ui";
import { useEffect, useRef } from "react";
import { uiActions, useUiStore } from "../../../../../stores/uiStore";
import { SidebarBody } from "../SidebarBody";

// The sidebar on a phone: a 280 px sheet from the left over the scrim. The
// topbar button opens it, and a navigation closes it, so the new page is
// what the person sees.
export function MobileSidebar() {
	const open = useUiStore((state) => state.mobileSidebarOpen);
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const shown = useRef(pathname);

	// A new path means the person picked a destination in the sheet.
	useEffect(() => {
		if (shown.current === pathname) return;
		shown.current = pathname;
		uiActions.setMobileSidebarOpen(false);
	}, [pathname]);

	return (
		<Sheet
			open={open}
			onOpenChange={uiActions.setMobileSidebarOpen}
			title="Navigation"
			side="left"
			width={280}
			motion="popover"
			bare
			className="gap-0.5 bg-surface px-2 py-2.5 text-sm"
		>
			<div className="flex h-full flex-col gap-0.5">
				<SidebarBody />
			</div>
		</Sheet>
	);
}
