import { ArrowSquareOut, Check, GitPullRequest, TextAlignLeft } from "@phosphor-icons/react";
import { ActorChip } from "../../../domain/ActorChip";
import { CheckRibbon, type Check as CheckRun } from "../../../domain/CheckRibbon";
import { PriorityIcon } from "../../../domain/PriorityIcon";
import { StatusIcon } from "../../../domain/StatusIcon";
import { TicketId } from "../../../domain/TicketId";
import { Avatar } from "../../../primitives/Avatar";
import { Badge } from "../../../primitives/Badge";
import { Button } from "../../../primitives/Button";
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

// The Needs-you row, the board card, and the PR row, built from the real
// components. This is where the pieces prove they fit together.
export function CompositionSection() {
	return (
		<Section
			name="Composition"
			note="the Needs-you row, a board card, and the PR row"
			className="flex-col items-stretch p-0"
		>
			<div
				data-testid="needs-you-row"
				className="group relative flex h-10 items-center gap-3 border-b border-border bg-accent-soft px-5 transition-colors duration-hover before:absolute before:top-1 before:bottom-1 before:left-0 before:w-0.5 before:rounded-r-sm before:bg-accent"
			>
				<span className="flex w-5 justify-center">
					<PriorityIcon priority="high" />
				</span>
				<span className="w-15.5">
					<TicketId id="CDE-42" />
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<span className="truncate">Restore the export pages after the upstream 1.27 merge</span>
					<Badge icon={<TextAlignLeft />}>4</Badge>
				</span>
				<span className="inline-flex w-37.5 items-center gap-2 whitespace-nowrap">
					<StatusIcon category="review" />
					Human Review
				</span>
				<span className="inline-flex w-27 items-center gap-1.5 text-fg-muted">
					<GitPullRequest className="size-3.5" aria-hidden="true" />
					<CheckRibbon size="mini" checks={checks} />
				</span>
				<span className="flex w-7 justify-center">
					<Avatar kind="agent" name="claude-code" />
				</span>
				<span className="w-13 text-right text-sm text-fg-muted tabular">2h</span>
				<span className="absolute inset-y-0 right-5 flex items-center gap-1.5 bg-accent-soft pl-3">
					<Button variant="primary" kbd="a">
						Approve
					</Button>
					<Button kbd="r">Send back</Button>
				</span>
			</div>

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
