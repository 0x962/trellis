import { IconButton, useMediaQuery } from "@trellis/ui";
import { PanelLeft, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { uiActions, useUiStore } from "../../../stores/uiStore";

export type TopbarProps = {
	// The heading and its marks.
	children: ReactNode;
	// The controls on the right: the view switch, the primary action.
	actions?: ReactNode;
};

// The page header: 44 px on a desktop, 48 px on a phone. A collapsed
// sidebar leaves the page with no way back to it, so the header then leads
// with the button that reopens it. A phone never shows the sidebar, so
// there the header always leads with the button that opens it in a sheet.
export function Topbar({ children, actions }: TopbarProps) {
	const collapsed = useUiStore((state) => state.sidebarCollapsed);
	const phone = useMediaQuery("(max-width: 767px)");
	return (
		<header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-5 max-md:h-12 max-md:px-4">
			{phone ? (
				<IconButton
					label="Open the sidebar"
					icon={<PanelLeft />}
					className="-ml-1.5"
					onClick={() => uiActions.setMobileSidebarOpen(true)}
				/>
			) : (
				collapsed && (
					<IconButton
						label="Expand sidebar"
						icon={<PanelLeftOpen />}
						className="-ml-2"
						onClick={() => uiActions.setSidebarCollapsed(false)}
					/>
				)
			)}
			<div className="flex min-w-0 items-center gap-2 max-md:[&_h1]:truncate max-md:[&_h1]:text-md max-md:[&_h1]:font-semibold">
				{children}
			</div>
			{actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
		</header>
	);
}
