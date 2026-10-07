import type { EpicSummary } from "@trellis/api";
import { Skeleton } from "@trellis/ui";
import type { ReactNode } from "react";
import { formatCount } from "../../../../../lib/format";
import { epicProgress } from "../../../epicBar";
import { currentWaveLabel } from "../../../epicNext";

export type EpicPageContextProps = {
	name: string;
	phoneTitle?: ReactNode;
	epic?: Pick<EpicSummary, "counts" | "currentWave" | "currentWaveIndex" | "waveCount" | "state">;
	pending?: boolean;
};

const waveContext = (epic: Pick<EpicSummary, "currentWave" | "currentWaveIndex" | "waveCount" | "state">): string => {
	const current = currentWaveLabel(epic);
	if (current !== null) return `Current wave: ${current}`;
	if (epic.waveCount === 0) return "No waves";
	if (epic.state === "canceled") return "Epic canceled";
	return "All waves complete";
};

export function EpicPageContext({ name, phoneTitle, epic, pending = false }: EpicPageContextProps) {
	const progress = epic === undefined ? null : epicProgress(epic.counts);
	const ticketNoun = progress?.of === 1 ? "ticket" : "tickets";

	return (
		<div
			data-epic-page-context=""
			className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-5 pb-2 text-sm text-fg-muted max-md:px-4"
		>
			<h1 data-epic-phone-name="" className="hidden w-full break-words text-md font-semibold text-fg max-md:block">
				{phoneTitle ?? name}
			</h1>
			{epic !== undefined && progress !== null ? (
				<>
					<span className="tabular">
						{formatCount(progress.done)} of {formatCount(progress.of)} {ticketNoun} done
					</span>
					<span aria-hidden="true">{"\u00b7"}</span>
					<span>{waveContext(epic)}</span>
				</>
			) : pending ? (
				<Skeleton width="w-64" height="h-4" />
			) : (
				<span>Progress unavailable</span>
			)}
		</div>
	);
}
