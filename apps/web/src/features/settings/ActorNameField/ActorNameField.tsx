import { Input } from "@trellis/ui";
import { useState } from "react";
import { setActorName } from "../../../lib/actor";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SettingsRow } from "../SettingsRow";

// The name every write is attributed to. A save writes it to the settings and
// stores it as the web actor, so the next request carries it.
export function ActorNameField() {
	const { saved, draft, edit, save } = useSettingsDraft();
	const [message, setMessage] = useState<string | null>(null);
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
		void save({ defaultActorName: name });
	};

	return (
		<SettingsRow label="Your name" hint="Every ticket you touch is attributed to this name.">
			<Input
				label="Your name"
				hideLabel
				value={value}
				invalid={message !== null}
				autoComplete="off"
				spellCheck={false}
				className="max-w-64"
				onChange={(event) => edit({ defaultActorName: event.target.value })}
				onBlur={commit}
			/>
			{message !== null && <p className="text-sm text-danger">{message}</p>}
		</SettingsRow>
	);
}
