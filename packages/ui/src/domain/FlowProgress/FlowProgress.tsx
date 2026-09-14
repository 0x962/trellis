import { UserCheck } from "@phosphor-icons/react";
import { Badge } from "../../primitives/Badge";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";

export function FlowProgress({
	status,
	steps,
	onDecide,
}: {
	status: string;
	steps: { key: string; title: string; state: string; output: string | null; error: string | null }[];
	onDecide: (key: string) => void;
}) {
	return (
		<section aria-label="Flow progress" className="flex min-w-0 flex-col gap-3">
			<Badge tone={status === "succeeded" ? "ok" : status === "failed" ? "bad" : "neutral"}>{status}</Badge>
			<ol className="flex flex-col gap-3">
				{steps.map((step) => (
					<li key={step.key} className="border border-border p-3">
						<div className="flex items-center justify-between gap-3">
							<span className="min-w-0 break-words text-sm font-medium">{step.title}</span>
							<div className="flex shrink-0 items-center gap-2">
								<Badge
									tone={
										step.state === "succeeded" ? "ok" : ["failed", "unknown"].includes(step.state) ? "bad" : "neutral"
									}
								>
									{step.state.replaceAll("_", " ")}
								</Badge>
								{step.state === "waiting_human" && (
									<Tooltip content={`Decide ${step.title}`}>
										<IconButton
											label={`Decide ${step.title}`}
											icon={<UserCheck />}
											onClick={() => onDecide(step.key)}
										/>
									</Tooltip>
								)}
							</div>
						</div>
						{step.error && (
							<p role="alert" className="mt-2 text-sm text-danger">
								{step.error}
							</p>
						)}
						{step.output && (
							<details className="mt-2 text-sm">
								<summary className="cursor-pointer">Step output</summary>
								<pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
									{step.output}
								</pre>
							</details>
						)}
					</li>
				))}
			</ol>
		</section>
	);
}
