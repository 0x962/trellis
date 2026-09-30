import { SettingsNav, Skeleton } from "@trellis/ui";
import { lazy, type ReactNode, Suspense } from "react";
import { useActor } from "../../../lib/actor";
import { type DesktopBridge, type DesktopSettingsBridge, desktopSettingsBridge } from "../../../lib/desktopBridge";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { ActorNameField } from "../ActorNameField";
import { DesktopSettings } from "../DesktopSettings";
import { MenuLinks } from "../MenuLinks";
import { NotificationSettings } from "../NotificationSettings";
import type { SettingsSectionId } from "../settingsUrl";
import { ThemeField } from "../ThemeField";

const AgentPromptSettings = lazy(() =>
	import("../AgentPromptSettings").then((module) => ({ default: module.AgentPromptSettings })),
);

export type SettingsViewProps = {
	// The section the nav marks and the content shows.
	section: SettingsSectionId;
	onSectionChange: (section: SettingsSectionId) => void;
};

type SettingsSection = {
	id: SettingsSectionId;
	title: string;
	hint: string;
	rows: ReactNode;
};

const sections: SettingsSection[] = [
	{ id: "menu-links", title: "Menu links", hint: "Add HTTPS links to the workspace sidebar.", rows: <MenuLinks /> },
	{
		id: "agent-prompt",
		title: "Agent prompt",
		hint: "Edit the shared prompt for agent, session, and flow harnesses. Each start or resume uses the saved template.",
		rows: (
			<Suspense fallback={<Skeleton className="prompt-template-loading" />}>
				<AgentPromptSettings />
			</Suspense>
		),
	},
	{
		id: "notifications",
		title: "Notifications",
		hint: "Choose alerts for session questions, completed turns, and failures.",
		rows: <NotificationSettings />,
	},
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
];

const desktopSection = (bridge: DesktopSettingsBridge): SettingsSection => ({
	id: "desktop",
	title: "Desktop",
	hint: "Choose the data directory and whether Trellis opens at login.",
	rows: <DesktopSettings bridge={bridge} />,
});

// The settings of the app: the notifications, the account, and, in the
// desktop app, the desktop itself. The nav on the left names each section
// and the content shows the one the caller holds.
//
// `SettingsSheet` draws this view in a sheet over the page a person is on,
// and `Topbar` puts the title into the header of that sheet. The desktop
// app draws it as a plain page at the settings URL while the person has no
// name yet, because that run mounts no sheet stack.
export function SettingsView({ section, onSectionChange }: SettingsViewProps) {
	const actor = useActor();
	const bridge = desktopSettingsBridge((window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop);
	const pages = bridge ? (actor === null ? [desktopSection(bridge)] : [...sections, desktopSection(bridge)]) : sections;
	const selected = pages.some((page) => page.id === section) ? section : pages[0]!.id;
	return (
		<>
			<Topbar>
				<PageTitle title="Settings" />
			</Topbar>
			<div className="page-card project-settings-layout">
				<SettingsNav
					label="Settings"
					items={pages.map(({ id, title }) => ({ id, label: title }))}
					selected={selected}
					onSelect={(id) => onSectionChange(id as SettingsSectionId)}
				/>
				<div className="project-settings-content">
					{pages.map(({ id, title, hint, rows }) => (
						<div key={id} hidden={selected !== id} className="project-settings-page">
							<section aria-label={title} className="project-settings-section">
								<header className="project-settings-heading">
									<div className="min-w-0">
										<h2 className="text-xl font-semibold text-fg">{title}</h2>
										<p className="mt-2 text-base leading-relaxed text-fg-muted text-pretty">{hint}</p>
									</div>
								</header>
								<div className="project-settings-fields">
									<div className="flex flex-col divide-y divide-border">
										{id === "agent-prompt" && selected !== id ? null : rows}
									</div>
								</div>
							</section>
						</div>
					))}
				</div>
			</div>
		</>
	);
}
