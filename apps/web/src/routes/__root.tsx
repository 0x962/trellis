import { createRootRouteWithContext, Link, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { EmptyState, Toaster } from "@trellis/ui";
import { useCallback } from "react";
import { CommandPalette } from "../features/command/CommandPalette";
import { openShortcutHelp, ShortcutHelp } from "../features/command/ShortcutHelp";
import { ReconnectBanner } from "../features/shell/ReconnectBanner";
import { Sidebar } from "../features/sidebar/Sidebar";
import { hasActor } from "../lib/actor";
import { type RouterContext, useApp } from "../lib/appContext";
import { HotkeyScope } from "../lib/hotkeyScope";
import { uiActions } from "../stores/uiStore";

// The two pages that render without the shell: the first run and the
// design gallery.
const bare = (pathname: string) => pathname === "/setup" || pathname.startsWith("/_gallery");

// `g p`: the sidebar's project tree is the project picker until the
// command palette exists. A collapsed sidebar opens first.
const focusProjectTree = () => {
	uiActions.setSidebarCollapsed(false);
	requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-project-tree] a")?.focus());
};

const linkClass =
	"inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg transition duration-hover hover:bg-bg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

// Every page but the bare two needs an identity and a project. Without an
// identity the app opens the first run; without a project it opens the
// project step of the same form.
export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context, location }) => {
		if (bare(location.pathname)) return;
		if (!hasActor()) throw redirect({ to: "/setup", replace: true });
		const projects = await context.queryClient.fetchQuery(context.orpc.projects.list.queryOptions({ input: {} }));
		if (projects.length === 0) throw redirect({ to: "/setup", search: { step: "project" }, replace: true });
	},
	component: RootComponent,
	notFoundComponent: PageNotFound,
});

function RootComponent() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const router = useRouter();
	const { live, scheduler } = useApp();
	const navigate = useCallback((href: string) => void router.navigate({ href }), [router]);

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
				<main className="flex min-h-0 min-w-0 flex-1 flex-col">
					<Outlet />
				</main>
			</div>
			<div data-command-palette="" hidden />
			<HotkeyScope
				navigate={navigate}
				pathname={pathname}
				onProjectPicker={focusProjectTree}
				onHelp={openShortcutHelp}
				scheduler={scheduler}
			/>
			<CommandPalette />
			<ShortcutHelp />
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
