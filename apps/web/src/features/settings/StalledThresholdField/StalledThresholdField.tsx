import { Input } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SettingsRow } from "../SettingsRow";

// How long a started ticket may sit without activity before Needs you lists
// it as stalled. The Stalled section is a server-side query over this number,
// so a save reads the inbox again.
export function StalledThresholdField() {
	const { orpc, queryClient } = useApp();
	const { saved, draft, edit, save } = useSettingsDraft();
	const [typed, setTyped] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	if (saved === undefined) return null;
	const value = typed ?? String(draft.stalledHours ?? saved.stalledHours);

	const change = (next: string) => {
		setTyped(next);
		const hours = Number(next);
		if (hours > 0) edit({ stalledHours: hours });
	};

	const commit = async () => {
		const hours = Number(value);
		if (!(hours > 0)) {
			setMessage("Enter a number of hours above zero.");
			return;
		}
		setMessage(null);
		if (hours === saved.stalledHours) return;
		const stored = await save({ stalledHours: hours });
		if (stored === undefined) return;
		setTyped(null);
		await queryClient.invalidateQueries({ queryKey: orpc.inbox.get.key(), refetchType: "all" });
	};

	return (
		<SettingsRow label="Stalled after" hint="Needs you lists a started ticket that stays quiet this long.">
			<Input
				label="Stalled after, in hours"
				hideLabel
				type="number"
				min={1}
				value={value}
				invalid={message !== null}
				className="max-w-24"
				onChange={(event) => change(event.target.value)}
				onBlur={() => void commit()}
			/>
			{message !== null && <p className="text-sm text-danger">{message}</p>}
		</SettingsRow>
	);
}
