import type { FlowNodeKind } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { flowKindOrder, flowKinds } from "../../../kinds";
import { KIND_MIME } from "../../flowDraft";

type NodePaletteProps = { onAdd: (kind: FlowNodeKind) => void };

// A click adds the step below the step before it and connects the two. A drag
// adds it where the person drops it, inside the box under the pointer. The
// tooltip names each kind, because the buttons show only an icon.
export function NodePalette({ onAdd }: NodePaletteProps) {
	return (
		<div role="toolbar" aria-label="Add a step" aria-orientation="vertical" className="flex flex-col gap-1">
			{flowKindOrder.map((kind) => {
				const meta = flowKinds[kind];
				return (
					<Tooltip key={kind} side="right" content={`${meta.label}: ${meta.description}`}>
						<IconButton
							label={`Add ${meta.label.toLowerCase()}`}
							icon={<meta.icon />}
							draggable
							onDragStart={(event) => {
								event.dataTransfer.setData(KIND_MIME, kind);
								event.dataTransfer.effectAllowed = "copy";
							}}
							onClick={() => onAdd(kind)}
						/>
					</Tooltip>
				);
			})}
		</div>
	);
}
