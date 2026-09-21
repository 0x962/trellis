import { DotsThree, SidebarSimple } from "@phosphor-icons/react";
import { IconButton, type IconButtonProps, Menu, type MenuProps, Tooltip, useMediaQuery } from "@trellis/ui";
import type { ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { usePageSheet } from "../PageSheet";

export type TopbarProps = {
	// The heading and its marks.
	children: ReactNode;
	// The controls on the right: the view switch, the primary action.
	actions?: ReactNode;
};

export type TopbarActionButtonProps = Omit<IconButtonProps, "size" | "variant">;

export function TopbarActionButton(props: TopbarActionButtonProps) {
	return <IconButton {...props} size="sm" variant="default" />;
}

export type TopbarActionMenuProps = Omit<MenuProps, "trigger"> & {
	icon?: ReactElement;
};

export function TopbarActionMenu({ icon = <DotsThree />, label, ...props }: TopbarActionMenuProps) {
	return <Menu label={label} trigger={<TopbarActionButton label={label} icon={icon} />} {...props} />;
}

export function Topbar({ children, actions }: TopbarProps) {
	const phone = useMediaQuery("(max-width: 767px)");
	const collapsed = useUiStore((state) => state.sidebarCollapsed);
	const sheet = usePageSheet();
	const heading = (
		<div className="flex min-w-0 flex-1 items-center gap-2 max-md:[&_h1]:truncate max-md:[&_h1]:text-md max-md:[&_h1]:font-semibold">
			{children}
		</div>
	);
	const controls = actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>;
	// A page in a `PageSheet` draws no bar of its own. The heading and the
	// controls render into the header of the sheet, before the buttons that
	// open the full page and close the sheet. The sidebar buttons stay out,
	// because the sidebar sits under the sheet.
	if (sheet !== null) {
		return (
			sheet.topbar &&
			createPortal(
				<>
					{heading}
					{controls}
				</>,
				sheet.topbar,
			)
		);
	}
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
			{heading}
			{controls}
		</header>
	);
}
