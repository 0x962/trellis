import { ArrowSquareOut, GithubLogo } from "@phosphor-icons/react";
import type { ReviewRevision } from "@trellis/api";
import { Badge, EmptyState, GroupHeader } from "@trellis/ui";
import { useId, useState } from "react";
import { type CheckGroupKey, checkGroupOrder, checkGroups, checkState, type ReviewCheck } from "./checkGroups";

export function ReviewChecks({ revision }: { revision: ReviewRevision | null }) {
	const id = useId();
	const checks = (revision?.meta.statusCheckRollup ?? []) as ReviewCheck[];
	const groups = checkGroups(checks);
	const checkCount = groups.reduce((total, group) => total + group.checks.length, 0);
	const [expanded, setExpanded] = useState<Record<CheckGroupKey, boolean>>(
		() =>
			Object.fromEntries(checkGroupOrder.map((group) => [group.key, group.expanded])) as Record<CheckGroupKey, boolean>,
	);
	return (
		<div className="review-scroll">
			<div className="review-list">
				<header className="review-section-heading">
					<h2>Checks</h2>
					<span className="review-meta">
						{checkCount} {checkCount === 1 ? "check" : "checks"}
					</span>
				</header>
				{groups.length ? (
					<div className="review-check-groups">
						{groups.map((group) => {
							const contentId = `${id}-${group.key}`;
							const tone =
								group.key === "failed"
									? "bad"
									: group.key === "running"
										? "wait"
										: group.key === "success"
											? "ok"
											: "neutral";
							return (
								<section key={group.key}>
									<GroupHeader
										group={group.key}
										label={group.label}
										count={group.checks.length}
										expanded={expanded[group.key]}
										controls={contentId}
										onToggle={() => setExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))}
									/>
									<div id={contentId} hidden={!expanded[group.key]}>
										{group.checks.map((check) => {
											const state = checkState(check);
											const url = check.detailsUrl ?? check.targetUrl;
											const LinkIcon = url?.startsWith("https://github.com/") ? GithubLogo : ArrowSquareOut;
											return (
												<div className="review-list-row" key={check.name}>
													<a className="inline-flex items-center gap-2" href={url} target="_blank" rel="noreferrer">
														<LinkIcon aria-hidden="true" className="size-3.5 shrink-0 text-fg-faint" />
														<span>{check.name}</span>
													</a>
													<Badge tone={tone}>
														{state.charAt(0) + state.slice(1).toLowerCase().replaceAll("_", " ")}
													</Badge>
												</div>
											);
										})}
									</div>
								</section>
							);
						})}
					</div>
				) : (
					<EmptyState title="No checks reported" description="GitHub checks will appear here when they run." />
				)}
			</div>
		</div>
	);
}
