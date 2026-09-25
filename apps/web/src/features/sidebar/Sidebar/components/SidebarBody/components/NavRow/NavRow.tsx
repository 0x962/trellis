import { Link } from "@tanstack/react-router";
import { cx, Tooltip } from "@trellis/ui";
import type { ReactElement, ReactNode } from "react";
import { pageSheetActions } from "../../../../../../../stores/pageSheetStore";
import { uiActions } from "../../../../../../../stores/uiStore";
import type { NavTarget } from "../../../../../../navRows";

const rowClass =
	"sidebar-row pl-2 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

type NavRowProps = {
	icon: ReactElement;
	label: string;
	accessibleLabel?: string;
	active?: boolean;
	trailing?: ReactNode;
	iconMark?: ReactNode;
} & (
	| { to: NavTarget; search?: Record<string, unknown>; browserUrl?: never }
	| { to?: never; search?: never; browserUrl: string }
);

export function NavRow({
	to,
	search,
	icon,
	label,
	accessibleLabel,
	active,
	trailing,
	iconMark,
	browserUrl,
}: NavRowProps) {
	const rowContent = (
		<>
			<span data-slot="leading" className="sidebar-leading">
				<span className="relative inline-flex">
					<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full">
						{icon}
					</span>
					{iconMark}
				</span>
			</span>
			<span data-slot="label" className="sidebar-label">
				{label}
			</span>
			<span data-slot="trailing" className="sidebar-trailing">
				{trailing}
			</span>
		</>
	);
	const rowProps = { "aria-label": accessibleLabel, className: cx(rowClass, active && "sidebar-selected font-medium") };
	const row =
		browserUrl !== undefined ? (
			<button
				type="button"
				{...rowProps}
				onClick={() => {
					uiActions.setMobileSidebarOpen(false);
					pageSheetActions.openBrowser(browserUrl);
				}}
			>
				{rowContent}
			</button>
		) : (
			<Link to={to} search={search} {...rowProps} aria-current={active ? "page" : undefined}>
				{rowContent}
			</Link>
		);
	return accessibleLabel === undefined ? row : <Tooltip content={accessibleLabel}>{row}</Tooltip>;
}
