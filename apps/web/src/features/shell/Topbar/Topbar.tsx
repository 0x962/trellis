import { SidebarSimple } from "@phosphor-icons/react";
import { IconButton, Tooltip, useMediaQuery } from "@trellis/ui";
import type { ReactNode } from "react";
import { uiActions, useUiStore } from "../../../stores/uiStore";

export type TopbarProps = {
	// The heading and its marks.
	children: ReactNode;
	// The controls on the right: the view switch, the primary action.
	actions?: ReactNode;
};

export function Topbar({ children, actions }: TopbarProps) {
	const phone = useMediaQuery("(max-width: 767px)");
	const collapsed = useUiStore((state) => state.sidebarCollapsed);
	return (
		<header
			data-page-topbar=""
			className="relative flex h-13 shrink-0 items-center gap-3 border-x border-transparent px-5 max-md:px-2 max-sm:gap-2"
		>
			{!phone && collapsed && (
				<Tooltip content="Expand sidebar">
					<IconButton
						data-desktop-sidebar-toggle=""
						label="Expand sidebar"
						icon={<SidebarSimple />}
						onClick={uiActions.toggleSidebar}
					/>
				</Tooltip>
			)}
			{phone ? (
				<IconButton
					label="Open the sidebar"
					icon={<SidebarSimple />}
					className="-ml-1.5"
					onClick={() => uiActions.setMobileSidebarOpen(true)}
				/>
			) : null}
			<div className="flex min-w-0 flex-1 items-center gap-2 max-md:[&_h1]:truncate max-md:[&_h1]:text-md max-md:[&_h1]:font-semibold">
				{children}
			</div>
			{actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
		</header>
	);
}
