import { cx } from "@trellis/ui";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { flowKinds } from "../../../kinds";
import { useFlowEditor } from "../../editorContext";
import type { CanvasNode } from "../../flowDraft";

// A budget or a loop, drawn as a box that holds other nodes. The edges into
// and out of the box connect the box as one step. A selected box shows
// handles on its corners to resize it.
export function BoxNode({ id, data, selected }: NodeProps<CanvasNode>) {
	const { issues } = useFlowEditor();
	const { fields } = data;
	const meta = flowKinds[fields.kind];
	const issue = issues.get(id);
	const limit = fields.kind === "budget" ? `${fields.minutes} min` : `${fields.maxRounds} rounds at most`;
	return (
		<div
			title={issue}
			className={cx(
				"flex size-full flex-col rounded-lg border border-dashed bg-surface/50 transition-colors duration-hover",
				selected ? "border-accent" : issue !== undefined ? "border-danger" : "border-border-strong",
			)}
		>
			<NodeResizer isVisible={selected} minWidth={160} minHeight={96} />
			<Handle type="target" position={Position.Left} id="in" />
			<header className="flex items-center gap-2 px-3 py-2 text-xs text-fg-muted">
				<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
					<meta.icon />
				</span>
				<span className="truncate font-medium text-fg">{fields.title}</span>
				<span className="ml-auto shrink-0 tabular-nums">{limit}</span>
			</header>
			<Handle type="source" position={Position.Right} id="out" />
		</div>
	);
}
