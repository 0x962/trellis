import { PrGlyph } from "../../../../domain/PrGlyph";
import { ProjectKey } from "../../../../domain/ProjectKey";
import { ProjectMark } from "../../../../domain/ProjectMark";
import { projectColorLabels, projectColors } from "../../../../domain/projectColors";
import { StatusIcon } from "../../../../domain/StatusIcon";
import { TicketId } from "../../../../domain/TicketId";
import { ActivityDot } from "../../../../primitives/ActivityDot";
import { Section } from "../../Section";

const keys = { orange: "CNY", teal: "CVS", blue: "TRL", pink: "HBR", azure: "MSA" };

// The glyphs must read on every project ground. `projectTokens.test.ts`
// measures that contrast.
export function ProjectRoomSection() {
	return (
		<Section
			name="ProjectRoom"
			note="one room per project color, the plain room last; the state glyphs on each ground"
			className="flex-col items-stretch"
		>
			{[...projectColors, null].map((color) => (
				<div
					key={color ?? "none"}
					data-project-color={color ?? undefined}
					className="project-room flex flex-wrap items-center gap-4 rounded-md border border-border p-3"
				>
					<span className="inline-flex items-center gap-2">
						<ProjectMark color={color} className="size-6" />
						<ProjectMark color={color} className="size-4" />
						<ProjectKey projectKey={keys[color ?? "blue"] ?? "TRL"} color={color} />
					</span>
					<span className="w-24 text-sm text-fg-muted">{color === null ? "No color" : projectColorLabels[color]}</span>
					<span className="inline-flex items-center gap-3">
						<TicketId id={`${keys[color ?? "blue"] ?? "TRL"}-386`} />
						<StatusIcon category="started" label="In Progress" />
						<StatusIcon category="done" label="Done" />
						<PrGlyph state="open" isQueued={false} readyForReview />
						<PrGlyph state="closed" isQueued={false} readyForReview />
						<PrGlyph state="merged" isQueued={false} readyForReview />
						<PrGlyph state="open" isQueued readyForReview />
						<ActivityDot label="Waits for you" placement="inline" tone="metal" />
					</span>
				</div>
			))}
		</Section>
	);
}
