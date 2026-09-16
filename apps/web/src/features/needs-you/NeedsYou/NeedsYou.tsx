import { useNavigate, useSearch } from "@tanstack/react-router";
import type { NeedsYouSort } from "@trellis/api";
import { Select } from "@trellis/ui";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { InboxSection } from "./components/InboxSection";

const sorts: { value: NeedsYouSort; label: string }[] = [
	{ value: "priority", label: "Priority: highest first, oldest first" },
	{ value: "-priority", label: "Priority: lowest first, oldest first" },
	{ value: "createdAt", label: "Age: oldest first" },
	{ value: "-createdAt", label: "Age: newest first" },
	{ value: "-updatedAt", label: "Updated: newest first" },
	{ value: "updatedAt", label: "Updated: oldest first" },
	{ value: "title", label: "Title: A to Z" },
	{ value: "-title", label: "Title: Z to A" },
];

export function NeedsYou() {
	const navigate = useNavigate({ from: "/needs-you" });
	const params = useSearch({ from: "/needs-you" });
	const search = { sort: params.sort ?? "priority", visibility: params.visibility ?? "active" };
	return (
		<>
			<Topbar>
				<PageTitle title="Needs you" />
			</Topbar>
			<div data-testid="needs-you-body" className="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
					<Select
						label="Show items"
						value={search.visibility}
						items={[
							{ value: "active", label: "Active" },
							{ value: "snoozed", label: "Snoozed" },
							{ value: "ignored", label: "Ignored" },
						]}
						onValueChange={(visibility) => void navigate({ search: { ...search, visibility } })}
					/>
					<Select
						label="Sort items"
						value={search.sort}
						items={sorts}
						onValueChange={(sort) => void navigate({ search: { ...search, sort } })}
					/>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
					<InboxSection section="review" {...search} />
					<InboxSection section="mentioned" {...search} />
				</div>
			</div>
		</>
	);
}
