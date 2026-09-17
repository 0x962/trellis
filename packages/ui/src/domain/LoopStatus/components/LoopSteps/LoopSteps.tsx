import { ArrowDown, ArrowUUpLeft } from "@phosphor-icons/react";
import { Badge } from "../../../../primitives/Badge";
import type { LoopStatusProps } from "../../LoopStatus";

export function LoopSteps({
	steps,
	errors,
	paused,
	nextRunAt,
}: Pick<LoopStatusProps, "steps" | "errors" | "paused" | "nextRunAt">) {
	return (
		<section aria-label="Loop steps" className="relative pl-6">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-8 left-0 w-6 rounded-l-xl border-y border-l border-border-strong"
			/>
			<ol className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
				{steps.map((step, index) => {
					const failures = errors.filter((entry) => entry.stepId === step.id);
					return (
						<li key={step.id} className={index < 2 ? "md:col-span-2 md:mx-auto md:w-3/5" : "min-w-0"}>
							{index > 0 && <ArrowDown aria-hidden="true" className="mx-auto my-3 size-4 text-fg-faint" />}
							<article
								aria-label={step.title}
								aria-current={step.active ? "step" : undefined}
								className={`relative flex min-w-0 flex-col gap-3 rounded-lg border p-4 ${step.active ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-border bg-surface"}`}
							>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<h3 className="text-sm font-semibold text-fg">{step.title}</h3>
									{step.active && (
										<Badge tone="accent">
											{step.id === "wait" ? (paused ? "Paused here" : "Waiting here") : "Working"}
										</Badge>
									)}
								</div>
								<p className="text-sm text-fg-muted text-pretty">{step.description}</p>
								{step.id === "wait" && (
									<p className="text-xs text-fg-muted tabular-nums">
										{paused
											? "Automatic passes paused. Run now performs one pass."
											: nextRunAt
												? `Next pass: ${new Date(nextRunAt).toLocaleTimeString()}`
												: "The next wait starts after both tasks finish."}
									</p>
								)}
								{step.detail && <p className="text-xs text-fg tabular-nums">{step.detail}</p>}
								{failures.length > 0 && (
									<div className="border-t border-border pt-3">
										<p className="mb-2 text-xs font-medium text-danger">Errors · {failures.length}</p>
										<ul aria-label={`${step.title} errors`} className="flex max-h-48 flex-col gap-3 overflow-y-auto">
											{failures.toReversed().map((entry) => (
												<li key={entry.id} className="text-xs">
													<time dateTime={entry.at} className="text-fg-muted tabular-nums">
														{new Date(entry.at).toLocaleString()}
													</time>
													<p className="whitespace-pre-wrap break-words text-danger">{entry.message}</p>
												</li>
											))}
										</ul>
									</div>
								)}
							</article>
						</li>
					);
				})}
			</ol>
			<div className="mt-4 flex items-center justify-center gap-2 text-xs text-fg-muted">
				<ArrowUUpLeft aria-hidden="true" className="size-4" />
				<span>Both tasks finish, then return to Wait</span>
			</div>
		</section>
	);
}
