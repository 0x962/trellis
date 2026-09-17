import { Switch } from "@trellis/ui";
import { useChatStore } from "../../../stores/chatStore";
import { SettingsRow } from "../SettingsRow";

// The chat tone: on or off for this browser.
export function ChatSoundField() {
	const sound = useChatStore((state) => state.sound);
	const setSound = useChatStore((state) => state.setSound);
	return (
		<SettingsRow label="Chat sound" hint="Play a short tone when a chat message from someone else arrives.">
			<Switch label={sound ? "On" : "Off"} checked={sound} onCheckedChange={setSound} />
		</SettingsRow>
	);
}
