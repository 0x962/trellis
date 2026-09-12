import type { FlowNodeKind } from "@trellis/api";
import { Button } from "@trellis/ui";
import { flowKindOrder, flowKinds } from "../../../kinds";
import { KIND_MIME } from "../../flowDraft";

type NodePaletteProps = { onAdd: (kind: FlowNodeKind) => void };

// A click adds the step below the step before it and connects the two. A drag
// adds it where the person drops it, inside the box under the pointer.
export function NodePalette({ onAdd }: NodePaletteProps) {
	return (
		<div
			role="toolbar"
			aria-label="Add a step"
			aria-orientation="vertical"
			className="flex flex-col gap-0.5 rounded-lg border border-border bg-elevated p-1 shadow-md"
		>
			{flowKindOrder.map((kind) => {
				const meta = flowKinds[kind];
				return (
					<Button
						key={kind}
						variant="quiet"
						align="start"
						icon={<meta.icon />}
						title={meta.description}
						draggable
						onDragStart={(event) => {
							event.dataTransfer.setData(KIND_MIME, kind);
							event.dataTransfer.effectAllowed = "copy";
						}}
						onClick={() => onAdd(kind)}
					>
						{meta.label}
					</Button>
				);
			})}
		</div>
	);
}
