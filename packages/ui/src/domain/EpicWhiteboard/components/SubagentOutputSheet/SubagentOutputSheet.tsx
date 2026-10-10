import { ArrowSquareOut } from "@phosphor-icons/react";
import { Badge } from "../../../../primitives/Badge";
import { IconButton } from "../../../../primitives/IconButton";
import { Sheet } from "../../../../primitives/Sheet";
import { SheetBody } from "../../../../primitives/SheetBody";
import { Tooltip } from "../../../../primitives/Tooltip";
import type { EpicWhiteboardProps } from "../../types";

const stateLabels: Record<string, string> = { started: "Started", "result-recorded": "Recorded result" };

export function SubagentOutputSheet({ detail, onClose, onOpenSource }: NonNullable<EpicWhiteboardProps["subagent"]>) {
	return (
		<Sheet
			open
			title="Subagent output"
			description="Recorded output from the source session."
			onOpenChange={(open) => !open && onClose()}
		>
			<SheetBody>
				<div className="flex items-center justify-between gap-3">
					{detail ? (
						<Badge>{stateLabels[detail.state] ?? detail.state}</Badge>
					) : (
						<span className="text-sm text-fg-muted">
							Recorded details are unavailable in the retained source files.
						</span>
					)}
					<Tooltip content="Open source session">
						<IconButton label="Open source session" icon={<ArrowSquareOut />} onClick={onOpenSource} />
					</Tooltip>
				</div>
				{detail && (
					<>
						<time dateTime={detail.observedAt} className="text-sm text-fg-muted tabular">
							{new Date(detail.observedAt).toLocaleString()}
						</time>
						{detail.prompt !== null && (
							<section className="flex flex-col gap-2">
								<h3 className="text-sm font-medium">Recorded prompt</h3>
								<pre className="whitespace-pre-wrap break-words font-sans text-sm">{detail.prompt}</pre>
							</section>
						)}
						{detail.output !== null && (
							<section className="flex flex-col gap-2">
								<h3 className="text-sm font-medium">Recorded result</h3>
								<pre className="whitespace-pre-wrap break-words font-mono text-xs">{detail.output}</pre>
							</section>
						)}
						{detail.providerChildIds.length > 0 && (
							<section className="flex flex-col gap-2">
								<h3 className="text-sm font-medium">Provider child IDs</h3>
								<pre className="whitespace-pre-wrap break-words font-mono text-xs">
									{detail.providerChildIds.join("\n")}
								</pre>
							</section>
						)}
					</>
				)}
			</SheetBody>
		</Sheet>
	);
}
