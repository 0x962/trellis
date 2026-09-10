import { lazy, Suspense, useState } from "react";
import { useSidebarHotkey } from "../../../lib/sidebarHotkey";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { SidebarBody } from "./components/SidebarBody";

// A desktop never opens the phone sheet, so its code stays out of the first
// load of the app.
const MobileSidebar = lazy(async () => ({ default: (await import("./components/MobileSidebar")).MobileSidebar }));

// The 240 px sidebar. `[` collapses it; a collapsed sidebar is out of the
// layout and out of the accessibility tree, and the topbar shows the button
// that brings it back. Below 768 px the aside leaves the layout, and the
// same content opens in a sheet from the topbar.
export function Sidebar() {
	const collapsed = useUiStore((state) => state.sidebarCollapsed);
	const mobileOpen = useUiStore((state) => state.mobileSidebarOpen);
	// The sheet mounts on its first open and then stays mounted, so it can
	// animate closed.
	const [sheetMounted, setSheetMounted] = useState(false);
	if (mobileOpen && !sheetMounted) setSheetMounted(true);
	useSidebarHotkey();

	return (
		<>
			<aside
				aria-label="Sidebar"
				hidden={collapsed}
				aria-hidden={collapsed || undefined}
				className="flex h-full w-60 shrink-0 flex-col gap-0.5 border-r border-border bg-bg px-2 py-2.5 text-base max-md:hidden"
			>
				<SidebarBody onCollapse={uiActions.toggleSidebar} />
			</aside>
			{sheetMounted && (
				<Suspense fallback={null}>
					<MobileSidebar />
				</Suspense>
			)}
		</>
	);
}
