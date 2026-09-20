import { type ReactNode, useId } from "react";
import { GroupHeader } from "../../domain/GroupHeader";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { EmptyState } from "../../primitives/EmptyState";
import { Skeleton } from "../../primitives/Skeleton";
import { type CheckStatus, CheckStatusIcon } from "../CheckStatusIcon";
import { type CheckResult, CheckResultRow } from "./components/CheckResultRow";

export type CheckResultGroup = { key: CheckStatus; label: string; checks: CheckResult[] };

export function CheckResults({
	title,
	description,
	groups,
	summary,
	loading = false,
	isCollapsed,
	onToggle,
}: {
	title: string;
	description?: string;
	groups: CheckResultGroup[];
	summary?: ReactNode;
	loading?: boolean;
	isCollapsed: (key: CheckStatus) => boolean;
	onToggle: (key: CheckStatus) => void;
}) {
	const id = useId();
	const phone = useMediaQuery("(max-width: 767px)");
	return (
		<div className="review-scroll review-check-scroll">
			<div className="review-checks" aria-busy={loading}>
				{loading ? (
					<>
						<span className="sr-only" role="status">
							Checks are loading
						</span>
						<div className="review-check-summary">
							<Skeleton width="w-10" height="h-10" className="shrink-0" />
							<div className="flex min-w-0 flex-1 flex-col gap-2">
								<Skeleton width="w-full" height="h-5" className="max-w-48" />
								<Skeleton width="w-full" className="max-w-64" />
							</div>
						</div>
						<div className="p-5">
							<Skeleton lines={5} />
						</div>
					</>
				) : groups.length === 0 ? (
					<EmptyState title="No checks reported" description="GitHub checks will appear here when they run." />
				) : (
					<>
						<header className="review-check-summary">
							{summary}
							<div className="min-w-0" role="status" aria-live="polite" aria-atomic="true">
								<h2>{title}</h2>
								{description && <p>{description}</p>}
							</div>
						</header>
						{groups.map((group) => {
							const contentId = `${id}-${group.key}`;
							return (
								<section key={group.key} aria-label={`${group.label} checks`}>
									<GroupHeader
										group={group.key}
										label={group.label}
										count={group.checks.length}
										icon={<CheckStatusIcon status={group.key} />}
										expanded={!isCollapsed(group.key)}
										controls={contentId}
										onToggle={() => onToggle(group.key)}
										phone={phone}
									/>
									<ul id={contentId} hidden={isCollapsed(group.key)}>
										{group.checks.map((check) => (
											<CheckResultRow key={check.key} check={check} />
										))}
									</ul>
								</section>
							);
						})}
					</>
				)}
			</div>
		</div>
	);
}
