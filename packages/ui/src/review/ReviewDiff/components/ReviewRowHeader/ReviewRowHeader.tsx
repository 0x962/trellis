import { ArrowLineDown, ArrowLineUp, ArrowsInLineVertical, ArrowsOutLineVertical } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { GroupHeader } from "../../../../domain/GroupHeader";
import { useMediaQuery } from "../../../../hooks/useMediaQuery";
import { Checkbox } from "../../../../primitives/Checkbox";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import { fileCountLabel } from "../../../FileRiskGroups";
import type { ReviewFile } from "../../parseReviewFiles";
import type { ExpandedFile, GapControls, ReviewRow } from "../../reviewRows";

// A file that Git did not rename carries the same path on both sides, and the
// arrow would then print that one path twice.
const fileLabel = (file: ReviewFile) =>
	file.prevName !== undefined && file.prevName !== file.name ? `${file.prevName} → ${file.name}` : file.name;

// The words of a row that sits between two hunks: the hunk specs of the
// patch, and how many lines the gap above the hunk still hides. The row
// after the last hunk has no specs, and it has no count until the file
// contents load.
const hunkLabel = (specs: string | null, gap: GapControls | null) => {
	const hidden = gap?.hidden ?? null;
	const count = hidden === null ? null : `${hidden} hidden ${hidden === 1 ? "line" : "lines"}`;
	return [specs, count].filter((part) => part !== null).join(" · ");
};

export function ReviewRowHeader({
	row,
	expanded,
	viewed,
	reasons,
	onViewed,
	toggleFile,
	expandGap,
}: {
	row: Extract<ReviewRow, { kind: "group" | "file" | "hunk" }>;
	expanded: ReadonlyMap<string, ExpandedFile>;
	viewed: ReadonlySet<string>;
	reasons: ReadonlyMap<string, readonly string[]>;
	onViewed?: (path: string, viewed: boolean) => void;
	toggleFile?: (file: ReviewFile) => Promise<void>;
	expandGap: (file: ReviewFile, gap: GapControls, direction: "down" | "up" | "all") => Promise<void>;
}) {
	const phone = useMediaQuery("(max-width: 767px)");
	// The file tree beside the diff draws the same four groups with the same
	// component, so both panes of the review look alike.
	if (row.kind === "group")
		return (
			<GroupHeader
				group={row.header.key}
				label={row.header.label}
				count={fileCountLabel(row.header.count)}
				collapsible={false}
				phone={phone}
			/>
		);
	if (row.kind === "file") {
		const isExpanded = expanded.get(row.file.name)?.full === true;
		const isViewed = viewed.has(row.file.name);
		const why = reasons.get(row.file.name);
		return (
			<header className="review-diff-file-header" data-file-path={row.file.name} data-viewed={isViewed}>
				<span className="review-diff-file-name">{fileLabel(row.file)}</span>
				{/* The file tree puts the same words in the hover text of its row,
			    which a touch screen never opens. */}
				{why && <span className="review-diff-file-reasons">{why.join(" · ")}</span>}
				<div className="review-diff-file-controls">
					{onViewed && (
						<Checkbox
							label="Viewed"
							checked={isViewed}
							onCheckedChange={(next) => onViewed(row.file.name, next)}
							className="review-diff-viewed"
						/>
					)}
					{toggleFile && row.file.hunks.length > 0 && !isViewed ? (
						<Tooltip content={isExpanded ? "Show patch only" : "Show full file"}>
							<IconButton
								label={isExpanded ? "Show patch only" : "Show full file"}
								icon={isExpanded ? <ArrowsInLineVertical /> : <ArrowsOutLineVertical />}
								onClick={() => void toggleFile(row.file)}
							/>
						</Tooltip>
					) : null}
				</div>
			</header>
		);
	}
	if (row.kind === "hunk") {
		const gap = row.gap;
		const control = (target: GapControls, direction: "down" | "up" | "all", label: string, icon: ReactElement) => (
			<Tooltip content={label}>
				<IconButton size="xs" label={label} icon={icon} onClick={() => void expandGap(row.file, target, direction)} />
			</Tooltip>
		);
		return (
			<div className="review-diff-hunk-header">
				<span className="review-diff-hunk-controls">
					{gap?.up ? control(gap, "up", "Expand up", <ArrowLineUp />) : null}
					{gap?.down ? control(gap, "down", "Expand down", <ArrowLineDown />) : null}
					{gap?.all ? control(gap, "all", "Expand all", <ArrowsOutLineVertical />) : null}
				</span>
				<span>{hunkLabel(row.specs, gap)}</span>
			</div>
		);
	}
}
