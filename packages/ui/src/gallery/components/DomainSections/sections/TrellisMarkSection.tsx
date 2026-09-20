import { TrellisMark } from "../../../../domain/TrellisMark";
import { Section } from "../../Section";

export function TrellisMarkSection() {
	return (
		<Section name="TrellisMark" note="16 px in the sidebar; 32 px on the setup card; the favicon drawing">
			<TrellisMark />
			<TrellisMark className="size-8" label="trellis" />
		</Section>
	);
}
