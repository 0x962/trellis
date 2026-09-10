import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EmptyState, Input } from "@trellis/ui";
import { Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { SearchResults } from "../features/search/SearchResults";
import { Topbar } from "../features/shell/Topbar";

type SearchParams = { q?: string };

// Full search results. `q` lives in the URL, so a search is a link.
export const Route = createFileRoute("/search")({
	validateSearch: (search: Record<string, unknown>): SearchParams =>
		typeof search.q === "string" && search.q !== "" ? { q: search.q } : {},
	loaderDeps: ({ search }) => ({ q: search.q }),
	loader: async ({ context, deps }) => {
		if (deps.q !== undefined) {
			await context.queryClient.ensureQueryData(context.orpc.search.query.queryOptions({ input: { q: deps.q } }));
		}
	},
	component: SearchPage,
});

function SearchPage() {
	const { q } = Route.useSearch();
	const navigate = useNavigate();
	const [draft, setDraft] = useState(q ?? "");

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const next = draft.trim();
		void navigate({ to: "/search", search: next === "" ? {} : { q: next } });
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
			<div className="min-h-0 flex-1 overflow-y-auto">
				{q === undefined ? (
					<EmptyState
						icon={<Search />}
						title="Search tickets and projects"
						description="A ticket identifier such as CDE-42 opens the ticket. A word matches titles, descriptions, and project names."
					/>
				) : (
					<SearchResults q={q} />
				)}
			</div>
		</>
	);
}
