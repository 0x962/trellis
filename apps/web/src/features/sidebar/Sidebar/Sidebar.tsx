import { cx } from "@trellis/ui";
import { lazy, Suspense, useState } from "react";
import { useSidebarHotkey } from "../../../lib/sidebarHotkey";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { SidebarBody } from "./components/SidebarBody";

// A desktop never opens the phone sheet, so its code stays out of the first
// load of the app.
const MobileSidebar = lazy(async () => ({ default: (await import("./components/MobileSidebar")).MobileSidebar }));

// The 240 px sidebar. `[` collapses it to a 48 px rail of icons, and the
// width animates between the two. The rail keeps the collapse button, which
// opens the sidebar again, so the aside never leaves the layout or the
// accessibility tree. Below 768 px the aside leaves the layout, and the same
// content opens in a sheet from the topbar.
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
				data-collapsed={collapsed || undefined}
				className={cx(
					"relative flex h-full shrink-0 flex-col gap-0.5 overflow-hidden bg-bg pb-2 text-base max-md:hidden",
					"transition-[width] duration-peek ease-in-out motion-reduce:transition-none",
					collapsed ? "w-12 px-2" : "w-60 px-2",
				)}
			>
				<SidebarBody collapsed={collapsed} onCollapse={uiActions.toggleSidebar} />
			</aside>
			{sheetMounted && (
				<Suspense fallback={null}>
					<MobileSidebar />
				</Suspense>
			)}
		</>
	);
}
