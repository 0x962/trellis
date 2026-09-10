import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Chip, EmptyState, Input } from "@trellis/ui";
import { Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { parseSearch, stripDefaults, type View } from "../features/filters/grammar";
import { SearchResults } from "../features/search/SearchResults";
import { Topbar } from "../features/shell/Topbar";
import { TicketPeek } from "../features/ticket/TicketPeek";

// Full search results. `q` lives in the URL, so a search is a link. The
// command palette opens a ticket in a peek over the page it is on, so the
// page mounts the peek with and without a query.
export const Route = createFileRoute("/search")({
	validateSearch: (search: Record<string, unknown>) => stripDefaults(parseSearch(search)),
	loaderDeps: ({ search }) => ({ q: search.q }),
	loader: async ({ context, deps }) => {
		if (deps.q !== undefined) {
			await context.queryClient.ensureQueryData(context.orpc.search.query.queryOptions({ input: { q: deps.q } }));
		}
	},
	component: SearchPage,
});

function SearchPage() {
	const search = Route.useSearch();
	const { q } = search;
	const navigate = useNavigate();
	const [draft, setDraft] = useState(q ?? "");

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const next = draft.trim();
		void navigate({ to: "/search", search: { ...search, q: next === "" ? undefined : next } });
	};

	const remove = (field: keyof View) => {
		void navigate({ to: "/search", search: { ...search, [field]: undefined } });
	};

	return (
		<>
			<Topbar>
				<h1 className="text-md font-semibold text-fg">Search</h1>
			</Topbar>
			<form onSubmit={submit} className="flex h-12 shrink-0 items-center border-b border-border px-5">
				<Input
					type="search"
					label="Search"
					hideLabel
					placeholder="Search tickets and projects"
					value={draft}
					autoFocus
					autoComplete="off"
					className="max-w-md"
					onChange={(event) => setDraft(event.target.value)}
				/>
			</form>
			{/* The search box owns `q`, so the chip row holds the other filters only. */}
			{search.priority !== undefined && (
				<div
					data-testid="search-filters"
					className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-5"
				>
					<Chip label="Priority" op="in" value={search.priority.join(", ")} onRemove={() => remove("priority")} />
				</div>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto">
				{q === undefined ? (
					<>
						<EmptyState
							icon={<Search />}
							title="Search tickets and projects"
							description="A ticket identifier such as CDE-42 opens the ticket. A word matches titles, descriptions, and project names."
						/>
						<TicketPeek />
					</>
				) : (
					<SearchResults q={q} filters={search}>
						<TicketPeek />
					</SearchResults>
				)}
			</div>
		</>
	);
}
