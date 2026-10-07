import type { EpicState, EpicSummary } from "@trellis/api";
import { Button, EmptyState, FailureState, GroupHeader, Skeleton } from "@trellis/ui";
import { errorMessage } from "../../../../../lib/conflict";
import { formatCount } from "../../../../../lib/format";
import { desktopRowHeight } from "../../../../table/rowHeights";
import { EpicRow } from "../EpicRow";

export type EpicGroup = {
	key: EpicState;
	label: string;
	epics: EpicSummary[];
};

export type EpicsListProps = {
	projectId: string;
	groups: EpicGroup[];
	pending: boolean;
	error: Error | null;
	retrying: boolean;
	readOnly: boolean;
	isCollapsed: (group: string) => boolean;
	onToggle: (group: string) => void;
	onRetry: () => void;
	onNew: () => void;
	onEdit: (epic: EpicSummary) => void;
	onDelete: (epic: EpicSummary) => void;
};

const skeletonWidths = ["w-2/5", "w-1/2", "w-[30%]", "w-[45%]"];

export function EpicsList({
	projectId,
	groups,
	pending,
	error,
	retrying,
	readOnly,
	isCollapsed,
	onToggle,
	onRetry,
	onNew,
	onEdit,
	onDelete,
}: EpicsListProps) {
	const hasRows = groups.some((group) => group.epics.length > 0);

	if (pending && !hasRows && error === null) {
		return (
			<div role="status" aria-label="Load epics" aria-busy="true">
				<span className="sr-only">Load epics</span>
				{skeletonWidths.map((width) => (
					<div
						key={width}
						style={{ minHeight: `${desktopRowHeight}px` }}
						className="flex items-center gap-3 border-b border-border px-5 max-md:min-h-14 max-md:px-4"
					>
						<div className="min-w-0 flex-1">
							<Skeleton width={width} />
						</div>
						<Skeleton width="w-35" className="max-md:hidden" />
						<Skeleton width="w-12" className="max-md:hidden" />
						<Skeleton width="w-12" className="max-md:hidden" />
						<Skeleton width="w-7" />
					</div>
				))}
			</div>
		);
	}

	if (!hasRows && error !== null) {
		return (
			<FailureState
				variant="page"
				title="The epics did not load"
				detail={errorMessage(error)}
				recovery={retrying ? "retrying" : undefined}
				action={
					retrying ? undefined : (
						<Button size="md" onClick={onRetry}>
							Retry
						</Button>
					)
				}
			/>
		);
	}

	if (!hasRows) {
		return (
			<EmptyState
				variant="page"
				title="No epics"
				description="An epic groups the tickets of one plan."
				action={
					readOnly ? undefined : (
						<Button variant="primary" size="md" onClick={onNew}>
							New epic
						</Button>
					)
				}
			/>
		);
	}

	return (
		<>
			{error !== null && (
				<FailureState
					variant="section"
					title="The epics did not refresh"
					detail={errorMessage(error)}
					description="The saved epics remain below."
					recovery={retrying ? "retrying" : undefined}
					action={
						retrying ? undefined : (
							<Button size="md" onClick={onRetry}>
								Retry
							</Button>
						)
					}
				/>
			)}
			{groups.map((group) => {
				const expanded = !isCollapsed(group.key);
				const controls = `epics-${projectId}-${group.key}`;
				return (
					<section key={group.key} aria-label={`${group.label} epics`}>
						<GroupHeader
							group={group.key}
							label={group.label}
							count={formatCount(group.epics.length)}
							expanded={expanded}
							controls={controls}
							appearance="inset"
							hasSectionGap
							sticky
							onToggle={() => onToggle(group.key)}
						/>
						{expanded && (
							<ul id={controls}>
								{group.epics.map((epic) => (
									<EpicRow
										key={epic.id}
										epic={epic}
										readOnly={readOnly}
										onEdit={() => onEdit(epic)}
										onDelete={() => onDelete(epic)}
									/>
								))}
							</ul>
						)}
					</section>
				);
			})}
		</>
	);
}
