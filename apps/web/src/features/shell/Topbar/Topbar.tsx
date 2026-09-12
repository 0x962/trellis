import { SidebarSimple } from "@phosphor-icons/react";
import { cx, IconButton, useMediaQuery } from "@trellis/ui";
import type { ReactNode } from "react";
import { uiActions } from "../../../stores/uiStore";

export type TopbarProps = {
	// The heading and its marks.
	children: ReactNode;
	// The controls on the right: the view switch, the primary action.
	actions?: ReactNode;
};

// The page header, 52 px tall. Its bottom rule starts 12 px in, and a
// rounded 12 px corner joins it to the rule the sidebar draws, so the page
// under the bar reads as one card with a rounded top-left corner. A phone
// has no sidebar beside the bar, so there the rule runs the full width and
// the corner goes.
//
// A collapsed sidebar leaves a rail of icons behind, which carries the
// control that opens it again, so the header adds nothing for it. A phone
// never shows the sidebar, so there the header leads with the button that
// opens it in a sheet.
export function Topbar({ children, actions }: TopbarProps) {
	const phone = useMediaQuery("(max-width: 767px)");
	return (
		<header
			className={cx(
				"relative flex h-13 shrink-0 items-center gap-3 px-5 max-md:px-4 max-sm:gap-2",
				"before:pointer-events-none before:absolute before:right-0 before:bottom-0 before:left-3 before:h-px before:bg-border max-md:before:left-0",
				"after:pointer-events-none after:absolute after:top-full after:-left-px after:size-3 after:-translate-y-px after:z-20 after:rounded-tl-lg after:border-t after:border-l after:border-border after:corner-mask max-md:after:hidden",
			)}
		>
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
