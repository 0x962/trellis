import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "@trellis/ui";
import type { ReactNode } from "react";
import { ActorNameField } from "../features/settings/ActorNameField";
import { AgentsSettings } from "../features/settings/AgentsSettings";
import { AgentTemplateField } from "../features/settings/AgentTemplateField";
import { DiffTemplateField } from "../features/settings/DiffTemplateField";
import { GhBanner } from "../features/settings/GhBanner";
import { PairPhone } from "../features/settings/PairPhone";
import { StalledThresholdField } from "../features/settings/StalledThresholdField";
import { ThemeField } from "../features/settings/ThemeField";
import { Topbar } from "../features/shell/Topbar";

// Who you are, how the app looks, what Start with agent copies, when a ticket
// counts as stalled, whether gh is available, which viewer shows a diff, how
// a phone reaches the server, and how the manager agents run. The Agent
// manager section loads its own data, so it sits last and its arrival moves
// no other section.
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
	// The anchor of the section, such as /settings#agents.
	id: string;
	title: string;
	rows: ReactNode;
};

// The groups of the page, top to bottom. A new group is one more entry.
const sections: SettingsSection[] = [
	{
		id: "account",
		title: "Account",
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
		rows: (
			<>
				<AgentTemplateField />
				<StalledThresholdField />
			</>
		),
	},
	{
		id: "integrations",
		title: "Integrations",
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
		rows: <AgentsSettings />,
	},
];

function SettingsPage() {
	return (
		<>
			<Topbar>
				<h1 className="text-lg font-semibold text-fg">Settings</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-5">
				<div className="mx-auto flex max-w-160 flex-col gap-8 py-8">
					{sections.map((section) => (
						<section key={section.id} id={section.id} aria-label={section.title}>
							<SectionHeader title={section.title} className="border-b border-border" />
							<div className="flex flex-col divide-y divide-border">{section.rows}</div>
						</section>
					))}
				</div>
			</div>
		</>
	);
}
