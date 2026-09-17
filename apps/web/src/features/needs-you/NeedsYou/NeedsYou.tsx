import { useNavigate, useSearch } from "@tanstack/react-router";
import type { NeedsYouSort } from "@trellis/api";
import { DisplayPopover } from "@trellis/ui";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { InboxFilter } from "./components/InboxFilter";
import { InboxSection } from "./components/InboxSection";

const fields = [
	{ value: "priority", label: "Priority", descending: true },
	{ value: "createdAt", label: "Created", descending: false },
	{ value: "updatedAt", label: "Updated", descending: true },
	{ value: "title", label: "Title", descending: false },
];

export function NeedsYou() {
	const navigate = useNavigate({ from: "/needs-you" });
	const params = useSearch({ from: "/needs-you" });
	const search = { sort: params.sort ?? "priority", visibility: params.visibility ?? "active" };
	const field = search.sort.replace(/^-/, "");
	const descending = field === "priority" ? search.sort === "priority" : search.sort.startsWith("-");
	return (
		<>
			<Topbar>
				<PageTitle title="Needs you" />
				<InboxFilter
					visibility={search.visibility}
					onChange={(visibility) => void navigate({ search: { ...search, visibility } })}
					actions={
						<DisplayPopover
							fields={fields}
							field={field}
							descending={descending}
							onSortChange={(next, desc) =>
								void navigate({
									search: {
										...search,
										sort: `${(next === "priority" ? !desc : desc) ? "-" : ""}${next}` as NeedsYouSort,
									},
								})
							}
							afterSort={
								field === "priority" ? (
									<p className="text-xs text-fg-faint">Oldest tickets first within each priority.</p>
								) : undefined
							}
						/>
					}
				/>
			</Topbar>
			<div data-testid="needs-you-body" className="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="min-h-0 flex-1 overflow-y-auto">
					<InboxSection section="review" {...search} />
					<InboxSection section="mentioned" {...search} />
				</div>
			</div>
		</>
	);
}
