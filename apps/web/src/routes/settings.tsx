import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ActorNameField } from "../features/settings/ActorNameField";
import { GhBanner } from "../features/settings/GhBanner";
import { PairPhone } from "../features/settings/PairPhone";
import { StalledThresholdField } from "../features/settings/StalledThresholdField";
import { ThemeField } from "../features/settings/ThemeField";
import { PageTitle } from "../features/shell/PageTitle";
import { Topbar } from "../features/shell/Topbar";

// Who you are, how the app looks, when a ticket counts as stalled, whether gh
// is available, and how a phone reaches the server.
// Each setting here holds for the whole machine. A setting that belongs to one
// project, such as its manager persona, its Superset host, and its agent
// switch, lives on that project's Manager page.
export const Route = createFileRoute("/settings")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.system.gh.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.system.health.queryOptions({})),
		]),
	component: SettingsPage,
});

type SettingsSection = {
	id: string;
	title: string;
	hint: string;
	rows: ReactNode;
};

const sections: SettingsSection[] = [
	{
		id: "account",
		title: "Account",
		hint: "Set your name and choose how trellis looks.",
		rows: (
			<>
				<ActorNameField />
				<ThemeField />
			</>
		),
	},
	{
		id: "agents",
		title: "Agents",
		hint: "Choose when a ticket counts as stalled. Each project picks its own ADE and manager on its Manager page.",
		rows: <StalledThresholdField />,
	},
	{
		id: "integrations",
		title: "Integrations",
		hint: "Connect trellis to GitHub and the mobile app.",
		rows: (
			<>
				<GhBanner />
				<PairPhone />
			</>
		),
	},
];

function SettingsPage() {
	const hash = useLocation({ select: (location) => location.hash });
	const selected = sections.some((section) => section.id === hash) ? hash : "account";
	return (
		<>
			<Topbar>
				<PageTitle title="Settings" />
			</Topbar>
			<div className="page-card project-settings-layout">
				<nav aria-label="Settings" className="project-settings-nav">
					<p className="project-settings-nav-title">Settings</p>
					<ul className="project-settings-nav-list">
						{sections.map(({ id, title }) => (
							<li key={id}>
								<Link
									to="/settings"
									search={{}}
									hash={id === "account" ? "" : id}
									hashScrollIntoView={false}
									activeOptions={{ exact: true, includeHash: true }}
									aria-current={selected === id ? "page" : undefined}
									className="project-settings-nav-link"
								>
									{title}
								</Link>
							</li>
						))}
					</ul>
				</nav>
				<div className="project-settings-content">
					{sections.map(({ id, title, hint, rows }) => (
						<div key={id} hidden={selected !== id} className="project-settings-page">
							<section aria-label={title} className="project-settings-section">
								<header className="project-settings-heading">
									<div className="min-w-0">
										<h2 className="text-xl font-semibold text-fg">{title}</h2>
										<p className="mt-2 text-base leading-relaxed text-fg-muted text-pretty">{hint}</p>
									</div>
								</header>
								<div className="project-settings-fields">
									<div className="flex flex-col divide-y divide-border">{rows}</div>
								</div>
							</section>
						</div>
					))}
				</div>
			</div>
		</>
	);
}
