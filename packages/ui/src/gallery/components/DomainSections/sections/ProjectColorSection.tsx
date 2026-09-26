import { PrGlyph } from "../../../../domain/PrGlyph";
import { ProjectKey } from "../../../../domain/ProjectKey";
import { ProjectMark } from "../../../../domain/ProjectMark";
import { projectColorLabels, projectColors } from "../../../../domain/projectColors";
import { StatusIcon } from "../../../../domain/StatusIcon";
import { TicketId } from "../../../../domain/TicketId";
import { ActivityDot } from "../../../../primitives/ActivityDot";
import { CheckStatusIcon } from "../../../../review/CheckStatusIcon";
import { Section } from "../../Section";

// A chip and a ticket id need a project key. The gallery has no projects, so
// every row carries one key and the name of the color stands beside it.
const sampleKey = "TRL";

// Every project color on the two places that carry it, the mark and the key
// chip, beside the glyphs of state that a row of that project also carries: a
// failed check, a passed check, and the silver dot that says the work waits
// for a person. Red sits next to the red of the failed check, amber next to the
// yellow of the in-progress mark, and green next to the green of the passed
// check. A reader tells the two apart by the slot each one sits in, not by the
// hue: the first two slots of a row name the project, and the rest name the
// state. `projectColors.test.ts` measures every value against its bar.
export function ProjectColorSection() {
	return (
		<Section
			name="ProjectColor"
			note={`${projectColors.length} colours for project marks and key chips, beside the state glyphs. No colour appears last.`}
			className="flex-col items-stretch"
		>
			{[...projectColors, null].map((color) => (
				<div key={color ?? "none"} className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3">
					<span className="inline-flex items-center gap-2">
						<ProjectMark color={color} className="size-6" />
						<ProjectMark color={color} className="size-4" />
						<ProjectKey projectKey={sampleKey} color={color} />
					</span>
					<span className="w-24 text-sm text-fg-muted">{color === null ? "No color" : projectColorLabels[color]}</span>
					<span className="inline-flex items-center gap-3">
						<TicketId id={`${sampleKey}-386`} />
						<StatusIcon category="started" label="In Progress" />
						<StatusIcon category="done" label="Done" />
						<CheckStatusIcon status="failed" />
						<CheckStatusIcon status="success" />
						<PrGlyph state="open" isQueued={false} askedForReview />
						<PrGlyph state="closed" isQueued={false} askedForReview />
						<PrGlyph state="merged" isQueued={false} askedForReview />
						<PrGlyph state="open" isQueued askedForReview />
						<ActivityDot label="Waits for you" placement="inline" tone="metal" />
					</span>
				</div>
			))}
		</Section>
	);
}
