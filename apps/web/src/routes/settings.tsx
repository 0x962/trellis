import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { Bot, Plug, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { ActorNameField } from "../features/settings/ActorNameField";
import { AgentLaunchField } from "../features/settings/AgentLaunchField";
import { AgentsSettings } from "../features/settings/AgentsSettings";
import { DiffTemplateField } from "../features/settings/DiffTemplateField";
import { GhBanner } from "../features/settings/GhBanner";
import { PairPhone } from "../features/settings/PairPhone";
import { StalledThresholdField } from "../features/settings/StalledThresholdField";
import { ThemeField } from "../features/settings/ThemeField";
import { Topbar } from "../features/shell/Topbar";

// Who you are, how the app looks, when a ticket counts as stalled, whether gh
// is available, which viewer shows a diff, how a phone reaches the server, and
// how the manager agents run. The Agent manager section loads its own data, so
// it sits last and its arrival moves no other section.
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
	icon: typeof UserRound;
	rows: ReactNode;
};

const sections: SettingsSection[] = [
	{
		id: "account",
		title: "Account",
		hint: "Set your name and choose how trellis looks.",
		icon: UserRound,
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
		hint: "Choose how trellis starts agents and when it marks a ticket as stalled.",
		icon: Bot,
		rows: (
			<>
				<AgentLaunchField />
				<StalledThresholdField />
			</>
		),
	},
	{
		id: "integrations",
		title: "Integrations",
		hint: "Connect trellis to GitHub and the mobile app.",
		icon: Plug,
		rows: (
			<>
				<GhBanner />
				<DiffTemplateField />
				<PairPhone />
			</>
		),
	},
	{
		id: "manager",
		title: "Agent manager",
		hint: "Give each project a manager agent and point it at a Superset project.",
		icon: Bot,
		rows: <AgentsSettings />,
	},
];

function SettingsPage() {
	const hash = useLocation({ select: (location) => location.hash });
	const selected = sections.some((section) => section.id === hash) ? hash : "account";
	return (
		<>
			<Topbar>
				<h1 className="text-lg font-semibold text-fg">Settings</h1>
			</Topbar>
			<div className="project-settings-layout">
				<nav aria-label="Settings" className="project-settings-nav">
					<p className="project-settings-nav-title">Settings</p>
					<ul className="project-settings-nav-list">
						{sections.map(({ id, title, icon: Icon }) => (
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
									<Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
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
