import { MergeConflictMark } from "../../../../domain/MergeConflictMark";
import { Section } from "../../Section";

export function MergeConflictMarkSection() {
	return (
		<Section
			name="MergeConflictMark"
			note="the pull request and its base branch went different ways; the small size, then the medium size"
		>
			<span className="inline-flex items-center gap-2 text-sm">
				<MergeConflictMark baseRef="main" /> 14 px, in a table row
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<MergeConflictMark baseRef="main" size="md" /> 16 px
			</span>
		</Section>
	);
}
