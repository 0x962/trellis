import { createRootRouteWithContext, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { EmptyState, Toaster } from "@trellis/ui";
import { CommandPalette } from "../features/command/CommandPalette";
import { ShortcutHelp } from "../features/command/ShortcutHelp";
import { ComposerHost } from "../features/composer/ComposerHost";
import { GlobalHotkeys } from "../features/shell/GlobalHotkeys";
import { ReconnectBanner } from "../features/shell/ReconnectBanner";
import { Sidebar } from "../features/sidebar/Sidebar";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFaviconBadge } from "../hooks/useFaviconBadge";
import { type RouterContext, useApp } from "../lib/appContext";
import { resolveActor } from "../lib/identity";

// The two pages that render without the shell: the first run and the
// design gallery.
const bare = (pathname: string) => pathname === "/setup" || pathname.startsWith("/_gallery");

const linkClass =
	"inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg transition duration-hover hover:bg-bg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

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
});

// `location` changes when a navigation starts, but the outlet keeps the old
// page until the new route has loaded. `resolvedLocation` is the page the
// outlet shows, so the layout and the page always match. It is unset only
// before the first load.
function RootComponent() {
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	const { live, scheduler } = useApp();
	useDocumentTitle(!bare(pathname));
	useFaviconBadge(!bare(pathname));

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
			<div className="flex min-w-0 flex-1 flex-col">
				<ReconnectBanner live={live} scheduler={scheduler} />
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
			title="Page not found"
			description="Nothing lives at this address."
			action={
				<Link to="/needs-you" className={linkClass}>
					Needs you
				</Link>
			}
			className="flex-1 justify-center"
		/>
	);
}
