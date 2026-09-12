import { cx } from "@trellis/ui";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { flowKinds } from "../../../kinds";
import { useFlowEditor } from "../../editorContext";
import type { CanvasNode } from "../../flowDraft";

const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

// A budget or a loop, drawn as an outline that holds other nodes. The box has
// no fill, so the canvas and the wires behind it stay visible. A wire into or
// out of the box connects the box as one step. A selected box shows corner
// handles to resize it.
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
				"flex size-full flex-col rounded-lg border border-dashed transition-colors duration-hover",
				selected ? "border-accent" : issue !== undefined ? "border-danger" : "border-border",
			)}
		>
			<NodeResizer isVisible={selected} minWidth={160} minHeight={96} lineClassName="opacity-0" />
			<header className="flex items-center gap-1.5 px-3 py-2 text-xs text-fg-faint">
				<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
					<meta.icon />
				</span>
				<span className="truncate text-fg-muted">{fields.title}</span>
				<span className="ml-auto shrink-0 tabular-nums">{limit}</span>
			</header>
			{sides.map((side) => (
				<Handle key={side} type="source" position={side} id={`out-${side}`} />
			))}
		</div>
	);
}
