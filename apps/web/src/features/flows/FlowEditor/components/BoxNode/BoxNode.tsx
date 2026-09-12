import { cx } from "@trellis/ui";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { flowKinds } from "../../../kinds";
import { useFlowEditor } from "../../editorContext";
import type { CanvasNode } from "../../flowDraft";

const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

// A transparent outline keeps the child steps and their wires visible.
// A selected group shows corner handles to resize it.
export function BoxNode({ id, data, selected }: NodeProps<CanvasNode>) {
	const { issues, unconnected } = useFlowEditor();
	const { fields } = data;
	const meta = flowKinds[fields.kind];
	const issue = issues.get(id);
	const title = fields.kind === "group" && fields.title === "New budget" ? "" : fields.title;
	const limit =
		fields.kind === "group"
			? [fields.parallel ? "Parallel" : "", fields.minutes === null ? "" : `${fields.minutes} min`]
					.filter(Boolean)
					.join(" · ")
			: `${fields.maxRounds} rounds at most`;
	return (
		<div
			title={issue}
			className={cx(
				"flow-node-hover-handles flex size-full flex-col rounded-lg border border-dashed transition-colors duration-hover",
				selected ? "border-accent" : issue !== undefined ? "border-danger" : "border-border",
			)}
		>
			<NodeResizer isVisible={selected} minWidth={160} minHeight={96} lineClassName="opacity-0" />
			<header className="flex items-center gap-1.5 px-3 py-2 text-xs text-fg-faint">
				<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
					<meta.icon />
				</span>
				{title !== "" && <span className="truncate text-fg-muted">{title}</span>}
				{limit !== "" && <span className="ml-auto shrink-0 tabular-nums">{limit}</span>}
			</header>
			{!unconnected.has(id) &&
				sides.map((side) => <Handle key={side} type="source" position={side} id={`out-${side}`} />)}
		</div>
	);
}
