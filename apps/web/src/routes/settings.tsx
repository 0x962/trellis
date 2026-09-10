import { createFileRoute } from "@tanstack/react-router";
import { ActorNameField } from "../features/settings/ActorNameField";
import { AgentTemplateField } from "../features/settings/AgentTemplateField";
import { GhBanner } from "../features/settings/GhBanner";
import { StalledThresholdField } from "../features/settings/StalledThresholdField";
import { ThemeField } from "../features/settings/ThemeField";
import { Topbar } from "../features/shell/Topbar";

// Who you are, how the app looks, what Start with agent copies, when a ticket
// counts as stalled, and whether gh is available.
export const Route = createFileRoute("/settings")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.system.gh.queryOptions({})),
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
				</div>
			</div>
		</>
	);
}
