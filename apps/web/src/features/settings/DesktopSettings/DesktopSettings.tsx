import { FolderOpen, FolderUser } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconButton, Switch, Tooltip, toast } from "@trellis/ui";
import type { ReactElement } from "react";
import { type DesktopAction, type DesktopSettingsBridge, desktopErrorMessage } from "../../../lib/desktopBridge";
import { SettingsRow } from "../SettingsRow";

const statusKey = ["desktop", "status"];

export function DesktopSettings({ bridge }: { bridge: DesktopSettingsBridge }) {
	const queryClient = useQueryClient();
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
	const { packaged, dataDirectory, openAtLogin } = status.data;
	const button = (label: string, name: DesktopAction, icon: ReactElement, options: { packagedOnly?: boolean } = {}) => (
		<Tooltip content={label}>
			<IconButton
				label={label}
				icon={icon}
				variant="quiet"
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
			<SettingsRow label="Open at login" hint="Open the Trellis window when you log in.">
				<Switch
					label="Open Trellis at login"
					checked={openAtLogin}
					disabled={!packaged || login.isPending}
					onCheckedChange={(enabled) => login.mutate(enabled)}
				/>
			</SettingsRow>
		</>
	);
}
