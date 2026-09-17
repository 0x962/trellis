import { Link } from "@tanstack/react-router";
import { cx } from "@trellis/ui";
import type { ReactElement, ReactNode } from "react";
import type { NavTarget } from "../../../../../../navRows";

const rowClass =
	"sidebar-row pl-2 text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

type NavRowProps = {
	to: NavTarget;
	icon: ReactElement;
	label: string;
	active: boolean;
	trailing?: ReactNode;
	iconMark?: ReactNode;
};

export function NavRow({ to, icon, label, active, trailing, iconMark }: NavRowProps) {
	return (
		<Link
			to={to}
			aria-current={active ? "page" : undefined}
			className={cx(rowClass, active && "sidebar-selected font-medium")}
		>
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
		</Link>
	);
}
