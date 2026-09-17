import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ActorNameField } from "../features/settings/ActorNameField";
import { ChatSoundField } from "../features/settings/ChatSoundField";
import { DesktopSettings } from "../features/settings/DesktopSettings";
import { HarnessAccounts } from "../features/settings/HarnessAccounts";
import { ThemeField } from "../features/settings/ThemeField";
import { PageTitle } from "../features/shell/PageTitle";
import { Topbar } from "../features/shell/Topbar";
import { readActor, useActor } from "../lib/actor";
import {
	canOpenDesktopSettingsBeforeSetup,
	type DesktopBridge,
	type DesktopSettingsBridge,
	desktopSettingsBridge,
} from "../lib/desktopBridge";

export const Route = createFileRoute("/settings")({
	loader: ({ context, location }) => {
		const desktop = (window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop;
		if (readActor() === null && canOpenDesktopSettingsBeforeSetup(desktop, location.pathname, location.hash)) return;
		return context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions({}));
	},
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
		id: "agent-accounts",
		title: "Agent accounts",
		hint: "Manage harness logins, account selection, and quota on this machine.",
		rows: <HarnessAccounts />,
	},
	{
		id: "account",
		title: "Account",
		hint: "Set your name, choose how trellis looks, and choose whether chat makes a sound.",
		rows: (
			<>
				<ActorNameField />
				<ThemeField />
				<ChatSoundField />
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

function SettingsPage() {
	const hash = useLocation({ select: (location) => location.hash });
	const actor = useActor();
	const bridge = desktopSettingsBridge((window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop);
	const pages = bridge ? (actor === null ? [desktopSection(bridge)] : [...sections, desktopSection(bridge)]) : sections;
	const selected = pages.some((section) => section.id === hash) ? hash : "account";
	return (
		<>
			<Topbar>
				<PageTitle title="Settings" />
			</Topbar>
			<div className="page-card project-settings-layout">
				<nav aria-label="Settings" className="project-settings-nav">
					<p className="project-settings-nav-title">Settings</p>
					<ul className="project-settings-nav-list">
						{pages.map(({ id, title }) => (
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
