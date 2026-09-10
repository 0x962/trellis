import { IconButton } from "@trellis/ui";
import { PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";
import { uiActions, useUiStore } from "../../../stores/uiStore";

export type TopbarProps = {
	// The heading and its marks.
	children: ReactNode;
	// The controls on the right: the view switch, the primary action.
	actions?: ReactNode;
};

// The 44 px page header. A collapsed sidebar leaves the page with no way
// back to it, so the header then leads with the button that reopens it.
export function Topbar({ children, actions }: TopbarProps) {
	const collapsed = useUiStore((state) => state.sidebarCollapsed);
	return (
		<header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-5">
			{collapsed && (
				<IconButton
					label="Expand sidebar"
					icon={<PanelLeftOpen />}
					className="-ml-2"
					onClick={() => uiActions.setSidebarCollapsed(false)}
				/>
			)}
			<div className="flex min-w-0 items-center gap-2">{children}</div>
			{actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
		</header>
	);
}
