import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ActorHeaderSchema } from "@trellis/api";
import { Badge, Button, Input, Select, Textarea, type ThemeMode, toast } from "@trellis/ui";
import { type ReactNode, useState } from "react";
import { Topbar } from "../features/shell/Topbar";
import { setActorName, useActor } from "../lib/actor";
import { useApp } from "../lib/appContext";
import { useTheme } from "../lib/theme";

const themes: { value: ThemeMode; label: string }[] = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

// Who you are, how the app looks, what Start with agent copies, and whether
// gh is available.
export const Route = createFileRoute("/settings")({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.system.health.queryOptions({})),
		]),
	component: SettingsPage,
});

function SettingsRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
	return (
		<div data-settings-row="" className="flex gap-8 border-b border-border py-5">
			<div className="w-48 shrink-0">
				<div className="font-medium text-fg">{label}</div>
				<p className="mt-0.5 text-sm text-fg-muted">{hint}</p>
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
		</div>
	);
}

function SettingsPage() {
	const { client, orpc, queryClient } = useApp();
	const actor = useActor()!;
	const settings = useSuspenseQuery(orpc.settings.get.queryOptions({})).data;
	const health = useSuspenseQuery(orpc.system.health.queryOptions({})).data;
	const { mode, setTheme } = useTheme();
	const [name, setName] = useState(actor.name);
	const [template, setTemplate] = useState(settings.startWithAgentTemplate);
	const nameValid = ActorHeaderSchema.safeParse(`human:${name.trim()}`).success;

	const commitName = () => {
		if (nameValid && name.trim() !== actor.name) setActorName(name.trim());
	};

	const save = async () => {
		const next = await client.settings.set({ ...settings, startWithAgentTemplate: template });
		queryClient.setQueryData(orpc.settings.get.queryKey({}), next);
		toast.success("Settings saved");
	};

	return (
		<>
			<Topbar>
				<h1 className="text-md font-semibold text-fg">Settings</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto px-8">
				<div className="flex max-w-3xl flex-col">
					<SettingsRow label="Your name" hint="Every ticket you touch is attributed to this name.">
						<Input
							label="Your name"
							hideLabel
							value={name}
							invalid={!nameValid}
							autoComplete="off"
							spellCheck={false}
							className="max-w-64"
							onChange={(event) => setName(event.target.value)}
							onBlur={commitName}
						/>
					</SettingsRow>
					<SettingsRow label="Theme" hint="System follows the operating system.">
						<Select label="Theme" items={themes} value={mode} onValueChange={setTheme} className="max-w-64" />
					</SettingsRow>
					<SettingsRow
						label="Start with agent"
						hint="The command the Start with agent button copies. {brief} stands for the ticket brief."
					>
						<Textarea
							label="Start with agent template"
							hideLabel
							rows={3}
							spellCheck={false}
							className="font-mono text-sm"
							value={template}
							onChange={(event) => setTemplate(event.target.value)}
						/>
						<Button onClick={save} disabled={template === settings.startWithAgentTemplate} className="self-start">
							Save
						</Button>
					</SettingsRow>
					<SettingsRow label="GitHub" hint="Pull request state and checks come from the gh CLI.">
						<div className="flex items-center gap-2">
							<Badge tone={health.gh.ok ? "ok" : "bad"}>{health.gh.ok ? "Connected" : "Not available"}</Badge>
							<span className="text-sm text-fg-muted">
								{health.gh.ok ? `Signed in as ${health.gh.user}` : health.gh.message}
							</span>
						</div>
					</SettingsRow>
				</div>
			</div>
		</>
	);
}
