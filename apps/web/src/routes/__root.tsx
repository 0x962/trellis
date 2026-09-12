import { createRootRouteWithContext, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { EmptyState, Toaster } from "@trellis/ui";
import { CommandPalette } from "../features/command/CommandPalette";
import { ShortcutHelp } from "../features/command/ShortcutHelp";
import { ComposerHost } from "../features/composer/ComposerHost";
import { GlobalHotkeys } from "../features/shell/GlobalHotkeys";
import { linkButtonClass } from "../features/shell/linkButtonClass";
import { RouteError } from "../features/shell/RouteError";
import { RouteProgress } from "../features/shell/RouteProgress";
import { ShellFrame } from "../features/shell/ShellFrame";
import { Sidebar } from "../features/sidebar/Sidebar";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import type { RouterContext } from "../lib/appContext";
import { resolveActor } from "../lib/identity";

// The two pages that render without the shell: the first run and the
// design gallery.
const bare = (pathname: string) => pathname === "/setup" || pathname.startsWith("/_gallery");

// Every page but the bare two needs an identity and a project. The server
// holds the identity, so only a server with no stored name and no project
// opens the first run. Without a project the app opens the project step of
// the same form. The settings come with the projects in one batched
// request, because the palette reads the agent command template on the
// first Cmd+K.
export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context, location }) => {
		if (bare(location.pathname)) return;
		const [projects, identity] = await Promise.all([
			context.queryClient.fetchQuery(context.orpc.projects.list.queryOptions({ input: {} })),
			context.queryClient.ensureQueryData(context.orpc.actors.default.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions()),
		]);
		if (!(await resolveActor(context, identity, projects.length))) throw redirect({ to: "/setup", replace: true });
		if (projects.length === 0) throw redirect({ to: "/setup", search: { step: "project" }, replace: true });
	},
	component: RootComponent,
	notFoundComponent: PageNotFound,
	// A cold load that waits on the server paints the empty shell. The root
	// needs its own Suspense boundary for that, because a root route has
	// none by default.
	wrapInSuspense: true,
	pendingComponent: ShellFrame,
	// The root load fails when the server does not answer. The error shows
	// inside the empty shell, so the whole app never turns white.
	errorComponent: ({ error }) => (
		<ShellFrame>
			<RouteError error={error} />
		</ShellFrame>
	),
});

// `location` changes when a navigation starts, but the outlet keeps the old
// page until the new route has loaded. `resolvedLocation` is the page the
// outlet shows, so the layout and the page always match. It is unset only
// before the first load.
function RootComponent() {
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	useDocumentTitle();

	if (bare(pathname)) {
		return (
			<>
				<Outlet />
				<Toaster />
			</>
		);
	}

	return (
		<div className="flex h-full bg-bg text-fg">
			<Sidebar />
			<div className="relative flex min-w-0 flex-1 flex-col">
				<RouteProgress />
				<main className="flex min-h-0 min-w-0 flex-1 flex-col bg-pane">
					<Outlet />
				</main>
			</div>
			<div data-command-palette="" hidden />
			<GlobalHotkeys />
			<CommandPalette />
			<ShortcutHelp />
			<ComposerHost />
			<Toaster />
		</div>
	);
}

function PageNotFound() {
	return (
		<EmptyState
			variant="page"
			title="Page not found"
			description="No page has this URL."
			action={
				<Link to="/needs-you" className={linkButtonClass}>
					Needs you
				</Link>
			}
		/>
	);
}
