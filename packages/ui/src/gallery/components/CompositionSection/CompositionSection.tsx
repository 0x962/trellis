import { ArrowSquareOut, Check, GitPullRequest, TextAlignLeft } from "@phosphor-icons/react";
import { ActorChip } from "../../../domain/ActorChip";
import { CheckRibbon, type Check as CheckRun } from "../../../domain/CheckRibbon";
import { PriorityIcon } from "../../../domain/PriorityIcon";
import { TicketId } from "../../../domain/TicketId";
import { Avatar } from "../../../primitives/Avatar";
import { Badge } from "../../../primitives/Badge";
import { Section } from "../Section";

const checks: CheckRun[] = [
	{ name: "lint", bucket: "pass" },
	{ name: "typecheck (desktop)", bucket: "pass" },
	{ name: "test (host-service)", bucket: "pass" },
	{ name: "build (macos-arm64)", bucket: "pass" },
	{ name: "e2e", bucket: "pass" },
	{ name: "size budget", bucket: "pass" },
];

const cardChecks: CheckRun[] = [
	{ name: "lint", bucket: "pass" },
	{ name: "typecheck", bucket: "fail" },
	{ name: "test", bucket: "pass" },
	{ name: "build", bucket: "pending" },
	{ name: "e2e", bucket: "pending" },
];

export function CompositionSection() {
	return (
		<Section name="Composition" note="a board card and the PR row" className="flex-col items-stretch p-0">
			<div className="flex gap-6 bg-bg p-5">
				<div
					data-testid="board-card"
					className="grid w-75 shrink-0 gap-1.5 self-start rounded-md border border-border bg-surface px-3 pt-2.25 pb-2.5 shadow-sm transition-shadow duration-hover hover:shadow-md"
				>
					<div className="flex items-center justify-between">
						<TicketId id="CDE-44" size="sm" />
						<PriorityIcon priority="urgent" />
					</div>
					<div className="line-clamp-2 text-base leading-4.5">Terminal pane loses scrollback on session handoff</div>
					<div className="flex items-center gap-2.5 text-xs text-fg-muted">
						<GitPullRequest className="size-3.25 text-fg-muted" aria-hidden="true" />
						<CheckRibbon size="mini" checks={cardChecks} />
						<Badge icon={<TextAlignLeft />}>2</Badge>
						<span className="ml-auto inline-flex items-center gap-1.5 tabular">
							<Avatar kind="agent" name="claude-code" />
							9m
						</span>
					</div>
				</div>

				<div data-testid="pr-row" className="min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-surface">
					<div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5">
						<GitPullRequest className="size-4 text-success" aria-hidden="true" />
						<span className="flex min-w-0 flex-col">
							<span className="truncate">
								<span className="mr-1.5 text-sm text-fg-muted">acme/web #118</span>
								<span className="font-medium">Restore export pages after the 1.27 merge</span>
							</span>
							<span className="mt-0.5 flex items-center gap-2 text-sm whitespace-nowrap text-fg-muted">
								<span className="truncate text-xs">cde-42-restore-export-pages → main</span>
								<span>·</span>
								<span>updated 3m ago</span>
								<span>·</span>
								<ActorChip name="claude-code" kind="agent" />
							</span>
						</span>
						<CheckRibbon checks={checks} />
						<span className="flex items-center gap-1.5">
							<Badge tone="ok" icon={<Check />}>
								6
							</Badge>
							<Badge tone="ok" className="bg-accent-soft text-accent">
								Approved
							</Badge>
						</span>
						<ArrowSquareOut className="size-3.5 text-fg-faint" aria-hidden="true" />
					</div>
					<div className="border-t border-border bg-bg">
						{checks.slice(0, 3).map((check) => (
							<div
								key={check.name}
								className="grid h-7.5 grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 border-t border-border pr-3 pl-10.5 text-sm first:border-t-0"
							>
								<Check className="size-3.25 text-success" weight="bold" aria-hidden="true" />
								<span>
									{check.name} <span className="text-fg-muted">· CI</span>
								</span>
								<span className="text-fg-muted tabular">1m 12s</span>
								<span className="text-fg-muted">Open</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</Section>
	);
}
