import { ActorChip } from "../../../../domain/ActorChip";
import { Section } from "../../Section";

export function ActorChipSection() {
	return (
		<Section name="ActorChip" note="human; agent; agent live; compact">
			<ActorChip name="dana" kind="human" />
			<ActorChip name="Codex agent" kind="agent" />
			<ActorChip name="claude-code" kind="agent" />
			<ActorChip name="claude-code" kind="agent" compact />
		</Section>
	);
}
