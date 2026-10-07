import { ActorHeaderSchema, type Settings } from "@trellis/api";
import { Input } from "@trellis/ui";
import { useRef, useState } from "react";
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
	const saving = useRef(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	if (saved === undefined) return null;
	const value = draft.defaultActorName ?? saved.defaultActorName;

	const applyStored = (stored: Settings) => {
		setActorName(stored.defaultActorName);
		rememberStoredName(app, stored.defaultActorName);
		setSavedAt(Date.now());
	};
	const update = async (name: string) => {
		if (saving.current) return;
		saving.current = true;
		setBusy(true);
		await save({ defaultActorName: name }, { onStored: applyStored, retry: () => void update(name) });
		saving.current = false;
		setBusy(false);
	};

	const commit = () => {
		if (saving.current) return;
		const name = value.trim();
		if (name === "") {
			setMessage("Enter a name.");
			return;
		}
		const actor = ActorHeaderSchema.safeParse(`human:${name}`);
		if (!actor.success) {
			setMessage(actor.error.issues[0]!.message);
			return;
		}
		setMessage(null);
		if (name === saved.defaultActorName) return;
		void update(name);
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
					disabled={busy}
					onChange={(event) => edit({ defaultActorName: event.target.value })}
					onBlur={commit}
				/>
				<SavedMark savedAt={savedAt} />
			</div>
		</SettingsRow>
	);
}
