import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectRefStringSchema, TicketRefStringSchema } from "@trellis/api";
import { Chip, EmptyState, Kbd } from "@trellis/ui";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useState } from "react";
import { searchDebounceMs } from "../features/command/hooks/useCommandSearch";
import { parseSearch, stripDefaults, type View } from "../features/filters/grammar";
import { useKeyboardFocusRing } from "../features/search/hooks/useKeyboardFocusRing";
import { SearchResults } from "../features/search/SearchResults";
import { PageTitle } from "../features/shell/PageTitle";
import { Topbar } from "../features/shell/Topbar";
import { useApp } from "../lib/appContext";

type SearchRouteSearch = Partial<View> & { rankProject?: string };

const parseSearchRoute = (search: Record<string, unknown>): SearchRouteSearch => {
	const parsed = stripDefaults(parseSearch(search));
	if (parsed.q !== undefined) {
		const q = parsed.q.trim();
		if (q === "") delete parsed.q;
		else parsed.q = q;
	}
	const rankProject = ProjectRefStringSchema.safeParse(search.rankProject);
	return rankProject.success ? { ...parsed, rankProject: rankProject.data } : parsed;
};

// `q` lives in the URL, so a search is a link.
export const Route = createFileRoute("/search")({
	validateSearch: parseSearchRoute,
	loaderDeps: ({ search }) => ({ q: search.q, rankProject: search.rankProject }),
	loader: async ({ context, deps }) => {
		if (deps.q !== undefined) {
			await context.queryClient.ensureQueryData(
				context.orpc.search.query.queryOptions({ input: { q: deps.q, rankProject: deps.rankProject } }),
			);
		}
	},
	component: SearchPage,
});

// The field is the page's main control, 40 px tall in a 64 px band. It has
// no box, so its text starts on the same edge as the page title under it.
// The ring shows only for a keyboard focus, so the autofocus on arrival
// draws no ring.
const fieldClass =
	"h-10 w-full rounded-md bg-transparent pr-10 text-md text-fg outline-none placeholder:text-fg-faint data-ring:ring-3 data-ring:ring-accent-soft [&::-webkit-search-cancel-button]:hidden";

function SearchPage() {
	const search = Route.useSearch();
	const { q } = search;
	const navigate = useNavigate();
	const { scheduler } = useApp();
	const [draft, setDraft] = useState(q ?? "");
	const id = useId();
	const focusRing = useKeyboardFocusRing();
	const trimmedDraft = draft.trim();

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const ticket = TicketRefStringSchema.safeParse(trimmedDraft);
		if (ticket.success) {
			void navigate({ to: "/t/$identifier", params: { identifier: ticket.data } });
			return;
		}
		void navigate({ to: "/search", search: { ...search, q: trimmedDraft === "" ? undefined : trimmedDraft } });
	};

	const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter") return;
		const ticket = TicketRefStringSchema.safeParse(trimmedDraft);
		if (!ticket.success) return;
		event.preventDefault();
		void navigate({ to: "/t/$identifier", params: { identifier: ticket.data } });
	};

	const remove = (field: keyof View) => {
		void navigate({ to: "/search", search: { ...search, [field]: undefined } });
	};

	useEffect(() => setDraft(q ?? ""), [q]);

	useEffect(() => {
		if (trimmedDraft === (q ?? "")) return;
		const handle = scheduler.setTimeout(() => {
			void navigate({
				to: "/search",
				search: { ...search, q: trimmedDraft === "" ? undefined : trimmedDraft },
				replace: true,
			});
		}, searchDebounceMs);
		return () => scheduler.clearTimeout(handle);
	}, [trimmedDraft, q, search, navigate, scheduler]);

	return (
		<>
			<Topbar>
				<PageTitle title="Search" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				<div className="flex h-16 shrink-0 items-center px-5">
					<form onSubmit={submit} className="relative w-full">
						<label htmlFor={id} className="sr-only">
							Search
						</label>
						<input
							id={id}
							type="search"
							placeholder="Search tickets, Pages, and projects"
							value={draft}
							// biome-ignore lint/a11y/noAutofocus: The field is the one control of the search page.
							autoFocus
							autoComplete="off"
							data-ring={focusRing.ring ? "" : undefined}
							onFocus={focusRing.onFocus}
							onBlur={focusRing.onBlur}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={keyDown}
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
						<EmptyState
							variant="page"
							title="Search tickets, Pages, and projects"
							description="A ticket ID such as CDE-42 opens the ticket. A word also matches Page text and project names."
						/>
					) : (
						<SearchResults q={q} filters={search} />
					)}
				</div>
			</div>
		</>
	);
}
