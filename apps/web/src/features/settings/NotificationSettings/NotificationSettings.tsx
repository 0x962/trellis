import { SpeakerHigh } from "@phosphor-icons/react";
import { defaultNotifications } from "@trellis/api";
import { IconButton, Select, Switch, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import type { DesktopBridge } from "../../../lib/desktopBridge";
import { previewNotification } from "../../../lib/sessionNotifications/sessionNotifications";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SettingsRow } from "../SettingsRow";

export function NotificationSettings() {
	const { saved, save } = useSettingsDraft();
	const [busy, setBusy] = useState(false);
	const [permission, setPermission] = useState("Notification" in window ? Notification.permission : "denied");
	const desktop = (window as Window & { trellisDesktop?: DesktopBridge }).trellisDesktop;
	if (!saved) return null;
	const value = saved.notifications ?? defaultNotifications;
	const update = async (patch: Partial<typeof value>) => {
		setBusy(true);
		await save({ notifications: { ...value, ...patch } });
		setBusy(false);
	};
	const native = async (enabled: boolean) => {
		if (enabled && !desktop && "Notification" in window) {
			const result = await Notification.requestPermission();
			setPermission(result);
			if (result !== "granted") return;
		}
		await update({ native: enabled });
	};
	return (
		<>
			<SettingsRow
				label="Desktop notifications"
				hint={
					desktop || permission === "granted"
						? "Show a notification when an agent needs input, finishes, or fails."
						: "Enable notifications in your browser to receive alerts."
				}
			>
				<Switch
					label="Desktop notifications"
					checked={value.native && Boolean(desktop || permission === "granted")}
					disabled={busy || (!desktop && !("Notification" in window))}
					onCheckedChange={(enabled) => void native(enabled)}
				/>
			</SettingsRow>
			<SettingsRow label="Sounds" hint="Play a sound for session alerts outside the active session.">
				<Switch
					label="Notification sounds"
					checked={value.sound}
					disabled={busy}
					onCheckedChange={(sound) => void update({ sound })}
				/>
			</SettingsRow>
			<SettingsRow label="Volume" hint="Preview the session alert sound.">
				<div className="flex items-center gap-3">
					<Select
						label="Notification volume"
						className="max-w-64"
						value={String(value.volume)}
						disabled={busy}
						items={[0, 25, 50, 75, 100].map((volume) => ({ value: String(volume), label: `${volume}%` }))}
						onValueChange={(volume) => void update({ volume: Number(volume) })}
					/>
					<Tooltip content="Preview sound">
						<IconButton
							label="Preview sound"
							icon={<SpeakerHigh />}
							onClick={() =>
								void previewNotification(value.volume).catch((error: Error) =>
									toast.error("The sound did not play.", { description: error.message }),
								)
							}
						/>
					</Tooltip>
				</div>
			</SettingsRow>
		</>
	);
}
