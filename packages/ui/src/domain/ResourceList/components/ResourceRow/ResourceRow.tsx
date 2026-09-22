import { ArrowUpRight, BookOpenText, DownloadSimple, File, FileText, Image, LinkSimple } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { cx } from "../../../../utils/cx";

// The four kinds of resource an epic holds. `packages/ui` imports no schema
// package, so this list repeats the one in
// `packages/api/src/schemas/resource.ts`.
export type ResourceKind = "doc" | "link" | "image" | "file";

export type ResourceListRow = {
	id: string;
	kind: ResourceKind;
	name: string;
	// The caller writes this text. The row shows it as the tooltip of the name.
	detail: string;
	// The number of the pull request that carries this resource as evidence.
	pullRequest: number | null;
	// True for the epic description, the first document of the list.
	plan?: boolean;
};

export type ResourceRowProps = {
	row: ResourceListRow;
	onOpen: (id: string) => void;
	// True for the row whose document is open beside the list.
	selected?: boolean;
};

const icons: Record<ResourceKind, ReactElement> = {
	doc: <FileText />,
	link: <LinkSimple />,
	image: <Image />,
	file: <File />,
};

// A link leaves the page and a file downloads, so those two rows name the
// result of a click at the right. A document and an image open in the app.
const trailing: Partial<Record<ResourceKind, ReactElement>> = {
	link: <ArrowUpRight />,
	file: <DownloadSimple />,
};

// One row of the Resources pane, in the shape of an app sidebar row: an icon,
// the name, and a trailing mark.
export function ResourceRow({ row, onOpen, selected = false }: ResourceRowProps) {
	const title = row.pullRequest === null ? row.detail : `${row.detail} · also evidence on #${row.pullRequest}`;
	return (
		<li>
			<button
				type="button"
				onClick={() => onOpen(row.id)}
				aria-current={selected ? "page" : undefined}
				title={title}
				className={cx(
					"sidebar-row group/resource w-full pl-2 text-left text-sm text-fg-muted hover:bg-elevated hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
					selected && "sidebar-selected font-medium",
				)}
			>
				<span aria-hidden="true" className="sidebar-leading">
					<span className="inline-flex size-4 shrink-0 *:size-full">
						{row.plan === true ? <BookOpenText /> : icons[row.kind]}
					</span>
				</span>
				<span className="sidebar-label">{row.name}</span>
				<span aria-hidden="true" className="sidebar-trailing text-fg-faint">
					{trailing[row.kind] !== undefined && (
						<span className="inline-flex size-3.5 opacity-0 transition-opacity duration-hover group-hover/resource:opacity-100 group-focus-visible/resource:opacity-100 *:size-full [@media(hover:none)]:opacity-100">
							{trailing[row.kind]}
						</span>
					)}
				</span>
			</button>
		</li>
	);
}
