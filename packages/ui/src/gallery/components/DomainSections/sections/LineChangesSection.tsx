import { LineChanges } from "../../../../domain/LineChanges";
import { Section } from "../../Section";

export function LineChangesSection() {
	return (
		<Section name="LineChanges" note="counts; a zero side; pending; unknown draws nothing; grouped digits">
			<LineChanges value={{ additions: 128, deletions: 34 }} pending={false} />
			<LineChanges value={{ additions: 2, deletions: 0 }} pending={false} />
			<LineChanges value={null} pending />
			<LineChanges value={null} pending={false} />
			<LineChanges value={{ additions: 12840, deletions: 9310 }} pending={false} align="start" />
		</Section>
	);
}
