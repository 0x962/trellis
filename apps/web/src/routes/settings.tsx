import { createFileRoute } from "@tanstack/react-router";
import { ActorNameField } from "../features/settings/ActorNameField";
import { AgentsSettings } from "../features/settings/AgentsSettings";
import { AgentTemplateField } from "../features/settings/AgentTemplateField";
import { GhBanner } from "../features/settings/GhBanner";
import { PairPhone } from "../features/settings/PairPhone";
import { StalledThresholdField } from "../features/settings/StalledThresholdField";
import { ThemeField } from "../features/settings/ThemeField";
import { Topbar } from "../features/shell/Topbar";

// Who you are, how the app looks, what Start with agent copies, when a ticket
// counts as stalled, whether gh is available, how a phone reaches the
// server, and how the agents run. The Agents block loads its own data, so
// it sits last and its arrival moves no other block.
export const Route = createFileRoute("/settings")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.system.gh.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.system.health.queryOptions({})),
		]),
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<>
			<Topbar>
				<h1 className="text-md font-semibold text-fg">Settings</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-8">
				<div className="flex max-w-3xl flex-col">
					<ActorNameField />
					<ThemeField />
					<AgentTemplateField />
					<StalledThresholdField />
					<GhBanner />
					<PairPhone />
					<AgentsSettings />
				</div>
			</div>
		</>
	);
}
