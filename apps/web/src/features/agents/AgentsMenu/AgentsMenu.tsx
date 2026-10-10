import { CaretDown, CaretRight, IdentificationCard, Robot } from "@phosphor-icons/react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { cx, IconButton, Menu } from "@trellis/ui";
import { useState } from "react";

export function AgentsMenu({ collapsed = false }: { collapsed?: boolean }) {
	const pathname = useLocation({ select: (location) => location.pathname });
	const navigate = useNavigate();
	const [expanded, setExpanded] = useState(true);
	const active = pathname === "/agents/roles";
	if (collapsed)
		return (
			<Menu
				label="Agents"
				triggerTooltip="Agents"
				trigger={<IconButton label="Agents" icon={<Robot />} />}
				items={[
					{ label: "Roles", icon: <IdentificationCard />, onSelect: () => void navigate({ to: "/agents/roles" }) },
				]}
			/>
		);
	return (
		<div>
			<button
				type="button"
				aria-expanded={expanded}
				onClick={() => setExpanded(!expanded)}
				className={cx(
					"sidebar-row w-full pl-2 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
					active && !expanded && "sidebar-selected font-medium",
				)}
			>
				<span className="sidebar-leading" aria-hidden="true">
					<Robot className="size-4" />
				</span>
				<span className="sidebar-label">Agents</span>
				<span className="sidebar-trailing" aria-hidden="true">
					{expanded ? <CaretDown className="size-3" /> : <CaretRight className="size-3" />}
				</span>
			</button>
			{expanded && (
				<Link
					to="/agents/roles"
					aria-current={active ? "page" : undefined}
					className={cx(
						"sidebar-row pl-8 text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
						active && "sidebar-selected font-medium",
					)}
				>
					<span className="sidebar-label">Roles</span>
				</Link>
			)}
		</div>
	);
}
