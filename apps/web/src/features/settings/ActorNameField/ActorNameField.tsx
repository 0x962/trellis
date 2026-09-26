import { Input } from "@trellis/ui";
import { useState } from "react";
import { setActorName } from "../../../lib/actor";
import { useApp } from "../../../lib/appContext";
import { rememberStoredName } from "../../../lib/identity";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SavedMark } from "../SavedMark";
import { SettingsRow } from "../SettingsRow";

// The name every write is attributed to. A save writes it to the settings,
// which every browser reads, and stores it as the web actor, so the next
// request carries it.
export function ActorNameField() {
	const app = useApp();
	const { saved, draft, edit, save } = useSettingsDraft();
	const [message, setMessage] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	if (saved === undefined) return null;
	const value = draft.defaultActorName ?? saved.defaultActorName;

	const commit = () => {
		const name = value.trim();
		if (name === "") {
			setMessage("Enter a name.");
			return;
		}
		setMessage(null);
		if (name === saved.defaultActorName) return;
		setActorName(name);
		void save({ defaultActorName: name }).then((stored) => {
			if (stored === undefined) return;
			rememberStoredName(app, stored.defaultActorName);
			setSavedAt(Date.now());
		});
	};

	return (
		<SettingsRow label="Your name" hint="trellis records this name as the actor of each change you make.">
			<div className="flex items-center gap-3">
				<Input
					label="Your name"
					hideLabel
					value={value}
					error={message ?? undefined}
					autoComplete="off"
					spellCheck={false}
					className="max-w-64"
					onChange={(event) => edit({ defaultActorName: event.target.value })}
					onBlur={commit}
				/>
				<SavedMark savedAt={savedAt} />
			</div>
		</SettingsRow>
	);
}
