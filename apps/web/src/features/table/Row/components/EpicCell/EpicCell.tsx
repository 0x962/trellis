import { Link } from "@tanstack/react-router";
import type { EpicLink } from "@trellis/api";
import { epicSplat } from "../../../../../lib/projectPath";

export type EpicCellProps = {
	epic: EpicLink;
};

const linkClass =
	"inline-flex h-7 max-w-full min-w-0 items-center rounded-md px-1 text-sm text-fg-muted transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The epic of a row: its name, as a link to the epic page. A long name
// truncates inside the column.
export function EpicCell({ epic }: EpicCellProps) {
	return (
		<Link to="/p/$" params={{ _splat: epicSplat(epic.ref) }} search={{}} className={linkClass} title={epic.name}>
			<span className="truncate">{epic.name}</span>
		</Link>
	);
}
