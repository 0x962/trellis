import { ArrowsClockwise, FolderOpen, FolderUser, GearSix, Play, Power, StopCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, type BadgeTone, IconButton, Switch, Tooltip, toast } from "@trellis/ui";
import type { ReactElement } from "react";
import {
	type DesktopAction,
	type DesktopBridge,
	type DesktopServiceStatus,
	type DesktopUpdateState,
	desktopErrorMessage,
} from "../../../lib/desktopBridge";
import { SettingsRow } from "../SettingsRow";

const services: Record<DesktopServiceStatus, { tone: BadgeTone; label: string }> = {
	enabled: { tone: "ok", label: "Enabled" },
	requiresApproval: { tone: "wait", label: "Needs approval in Login Items" },
	notRegistered: { tone: "bad", label: "Not registered" },
	notFound: { tone: "bad", label: "Not found" },
	unknown: { tone: "neutral", label: "Unknown" },
};

const updates: Record<DesktopUpdateState, { tone: BadgeTone; label: string }> = {
	current: { tone: "ok", label: "Current" },
	"restart-required": { tone: "wait", label: "Restart required" },
	blocked: { tone: "bad", label: "Blocked" },
};

const statusKey = ["desktop-status"];

// The settings and service actions of the macOS app. The desktop main process
// runs each action. Choose data directory and Stop local work ask for a native
// confirmation before they change anything.
export function DesktopSettings({ bridge }: { bridge: DesktopBridge }) {
	const queryClient = useQueryClient();
	// The QueryClient never marks data stale. The user changes the service
	// approval and the update outside this window, in System Settings or in
	// the menu bar, so the page reads the status again on each return.
	const status = useQuery({
		queryKey: statusKey,
		queryFn: () => bridge.status(),
		refetchOnWindowFocus: "always",
	});
	const refresh = () => queryClient.invalidateQueries({ queryKey: statusKey });
	const onError = (error: Error) =>
		toast.error("The desktop action failed", { description: desktopErrorMessage(error) });
	const action = useMutation({ mutationFn: (name: DesktopAction) => bridge.run(name), onSettled: refresh, onError });
	const login = useMutation({
		mutationFn: (enabled: boolean) => bridge.setOpenAtLogin(enabled),
		onSettled: refresh,
		onError,
	});
	if (status.isError)
		return (
			<p role="alert" className="py-4 text-sm text-danger">
				{desktopErrorMessage(status.error)}
			</p>
		);
	if (status.isPending)
		return (
			<p role="status" className="py-4 text-sm text-fg-muted">
				Load desktop status…
			</p>
		);
	const { packaged, dataDirectory, openAtLogin, service, update } = status.data;
	const button = (
		label: string,
		name: DesktopAction,
		icon: ReactElement,
		options: { danger?: boolean; packagedOnly?: boolean } = {},
	) => (
		<Tooltip content={label}>
			<IconButton
				label={label}
				icon={icon}
				variant={options.danger ? "danger" : "quiet"}
				disabled={action.isPending || (options.packagedOnly && !packaged)}
				onClick={() => action.mutate(name)}
			/>
		</Tooltip>
	);
	return (
		<>
			<SettingsRow label="Data directory" hint="Trellis keeps its database and host logs in this folder.">
				<p className="font-mono text-sm break-all text-fg">{dataDirectory}</p>
				<div className="flex items-center gap-2">
					{button("Show data directory", "showDataDirectory", <FolderOpen />)}
					{button("Choose data directory", "chooseDataDirectory", <FolderUser />, { packagedOnly: true })}
				</div>
			</SettingsRow>
			<SettingsRow
				label="Open at login"
				hint="Open the Trellis window when you log in. The background service starts at login without this setting."
			>
				<Switch
					label="Open Trellis at login"
					checked={openAtLogin}
					disabled={!packaged || login.isPending}
					onCheckedChange={(enabled) => login.mutate(enabled)}
				/>
			</SettingsRow>
			<SettingsRow
				label="Background service"
				hint="The service keeps local agents active after Trellis closes. System Settings controls its permission to run at login."
			>
				<div className="flex items-center gap-2">
					{service ? (
						<Badge tone={services[service].tone}>{services[service].label}</Badge>
					) : (
						<span className="text-sm text-fg-muted">The development app has no background service.</span>
					)}
					{button("Open Login Items in System Settings", "openServiceSettings", <GearSix />, { packagedOnly: true })}
				</div>
			</SettingsRow>
			<SettingsRow label="Update" hint="The package of this app, and whether the host runs it.">
				{update ? (
					<>
						<Badge tone={updates[update.state].tone} className="self-start">
							{updates[update.state].label}
						</Badge>
						<p className="text-sm text-fg">{update.detail}</p>
						<p className="text-sm text-fg-muted tabular-nums">
							Package {update.version}, release {update.release}, runtime protocol {update.protocol}
						</p>
					</>
				) : (
					<p className="text-sm text-fg-muted">The development app has no package.</p>
				)}
			</SettingsRow>
			<SettingsRow
				label="Local work"
				hint="Stop pauses local dispatch, stops local agent processes, disables the background service, and quits Trellis. Resume allows new local launches."
			>
				<div className="flex items-center gap-2">
					{button("Stop local work and background service", "stopLocalWork", <StopCircle />, { danger: true })}
					{button("Resume local work", "resumeLocalWork", <Play />)}
				</div>
			</SettingsRow>
			<SettingsRow label="Host connection" hint="Connect to the local host again and reload this window.">
				<div className="flex items-center gap-2">{button("Reconnect host", "reconnectHost", <ArrowsClockwise />)}</div>
			</SettingsRow>
			<SettingsRow label="Quit" hint="Close the Trellis app. The host and its agents keep running.">
				<div className="flex items-center gap-2">{button("Quit Trellis (keep agents running)", "quit", <Power />)}</div>
			</SettingsRow>
		</>
	);
}
