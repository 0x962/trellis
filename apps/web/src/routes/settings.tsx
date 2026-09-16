import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ActorNameField } from "../features/settings/ActorNameField";
import { ChatSoundField } from "../features/settings/ChatSoundField";
import { DesktopSettings } from "../features/settings/DesktopSettings";
import { Diagnostics } from "../features/settings/Diagnostics";
import { DraftTransfer } from "../features/settings/DraftTransfer";
import { GhBanner } from "../features/settings/GhBanner";
import { PairPhone } from "../features/settings/PairPhone";
import { ThemeField } from "../features/settings/ThemeField";
import { PageTitle } from "../features/shell/PageTitle";
import { Topbar } from "../features/shell/Topbar";
import { readActor, useActor } from "../lib/actor";
import { canOpenDesktopSettingsBeforeSetup, type DesktopBridge, desktopSettingsBridge } from "../lib/desktopBridge";

// Who you are, how the app looks, whether gh is available, and how a phone
// reaches the server. Inside the macOS app, the Desktop section also holds
// the data directory, the background service, the update status, and the
// local work actions.
// Each setting here holds for the whole machine. A setting that belongs to one
// project, such as its manager persona, its Superset host, and its agent
// switch, lives on that project's Manager page.
export const Route = createFileRoute("/settings")({
	loader: ({ context, location }) => {
		const desktop = (window as Window & { trellisDesktop?: Partial<DesktopBridge> }).trellisDesktop;
		if (readActor() === null && canOpenDesktopSettingsBeforeSetup(desktop, location.pathname, location.hash)) return;
		return Promise.all([
			context.queryClient.ensureQueryData(context.orpc.settings.get.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.system.gh.queryOptions({})),
			context.queryClient.ensureQueryData(context.orpc.system.health.queryOptions({})),
		]);
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
		id: "diagnostics",
		title: "Diagnostics",
		hint: "Inspect the local execution service, manager queue, and unresolved attempts.",
		rows: <Diagnostics />,
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
	{
		id: "drafts",
		title: "Drafts",
		hint: "Move unsaved edits between this browser and the desktop app.",
		rows: <DraftTransfer />,
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

const desktopSection = (bridge: DesktopBridge): SettingsSection => ({
	id: "desktop",
	title: "Desktop",
	hint: "Choose the data directory, check the background service and the update, and stop or resume local work.",
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
