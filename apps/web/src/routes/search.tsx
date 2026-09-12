import { MagnifyingGlass } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Chip, EmptyState, Kbd } from "@trellis/ui";
import { type FormEvent, useId, useState } from "react";
import { parseSearch, stripDefaults, type View } from "../features/filters/grammar";
import { useKeyboardFocusRing } from "../features/search/hooks/useKeyboardFocusRing";
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

// The field is the page's main control: 40 px tall, up to 720 px wide, in
// a 64 px band. The accent border and ring show only for a keyboard focus,
// so the autofocus on arrival draws no ring.
const fieldClass =
	"h-10 w-full rounded-md border border-border bg-surface pr-10 pl-9 text-md text-fg outline-none transition-colors duration-hover ease-out placeholder:text-fg-faint hover:border-border-strong data-ring:border-accent data-ring:ring-3 data-ring:ring-accent-soft [&::-webkit-search-cancel-button]:hidden";

function SearchPage() {
	const search = Route.useSearch();
	const { q } = search;
	const navigate = useNavigate();
	const [draft, setDraft] = useState(q ?? "");
	const id = useId();
	const focusRing = useKeyboardFocusRing();

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
				<h1 className="sr-only">Search</h1>
			</Topbar>
			<div className="flex h-16 shrink-0 items-center border-b border-border px-5">
				<form onSubmit={submit} className="relative w-full">
					<label htmlFor={id} className="sr-only">
						Search
					</label>
					<MagnifyingGlass
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint"
					/>
					<input
						id={id}
						type="search"
						placeholder="Search tickets and projects"
						value={draft}
						// biome-ignore lint/a11y/noAutofocus: The field is the one control of the search page.
						autoFocus
						autoComplete="off"
						data-ring={focusRing.ring ? "" : undefined}
						onFocus={focusRing.onFocus}
						onBlur={focusRing.onBlur}
						onChange={(event) => setDraft(event.target.value)}
						className={fieldClass}
					/>
					{draft === "" && <Kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">/</Kbd>}
				</form>
			</div>
			{/* The search box owns `q`, so the chip row holds the other filters only. */}
			{search.priority !== undefined && (
				<div
					data-testid="search-filters"
					className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-5"
				>
					<Chip label="Priority" op="in" value={search.priority.join(", ")} onRemove={() => remove("priority")} />
				</div>
			)}
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{q === undefined ? (
					<>
						<EmptyState
							variant="page"
							title="Search tickets and projects"
							description="A ticket ID such as CDE-42 opens the ticket. A word matches ticket titles, descriptions, and project names."
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
