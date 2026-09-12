import { cx } from "@trellis/ui";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { flowKinds } from "../../../kinds";
import { useFlowEditor } from "../../editorContext";
import type { CanvasNode } from "../../flowDraft";

const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

// The card of an agent, a gate, or a human node. A card has a handle on each
// side, and a wire can start or end on any of them. A gate starts a wire only
// from its YES and NO handles, on its right and bottom sides. Its top and
// left handles only end a wire.
export function StepNode({ id, data, selected }: NodeProps<CanvasNode>) {
	const { personas, issues, unconnected } = useFlowEditor();
	const { fields } = data;
	const meta = flowKinds[fields.kind];
	const issue = issues.get(id);
	const persona = fields.personaId === null ? undefined : personas.get(fields.personaId);
	const detail =
		fields.kind === "human"
			? "A person decides"
			: persona !== undefined
				? persona.name
				: fields.personaId !== null
					? "Missing persona"
					: fields.instruction.trim() === ""
						? "No instruction"
						: "Custom instruction";
	return (
		<div
			title={issue}
			className={cx(
				"flex w-56 items-center gap-2 rounded-md border bg-elevated px-3 py-2 shadow-sm transition-colors duration-hover",
				selected ? "border-accent" : issue !== undefined ? "border-danger" : "border-border",
			)}
		>
			<span aria-hidden="true" className="inline-flex size-4 shrink-0 text-fg-muted *:size-full">
				<meta.icon />
			</span>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-fg">{fields.title}</p>
				<p
					className={cx(
						"truncate text-xs",
						persona === undefined && fields.personaId !== null ? "text-danger" : "text-fg-faint",
					)}
				>
					{detail}
				</p>
			</div>
			{!unconnected.has(id) &&
				(fields.kind === "gate" ? (
					<>
						<Handle type="source" position={Position.Top} id="in-top" isConnectableStart={false} />
						<Handle type="source" position={Position.Left} id="in-left" isConnectableStart={false} />
						<Handle
							type="source"
							position={Position.Right}
							id="yes-right"
							aria-label="Yes"
							className="top-1/3! border-success!"
						/>
						<Handle
							type="source"
							position={Position.Right}
							id="no-right"
							aria-label="No"
							className="top-2/3! border-danger!"
						/>
						<Handle
							type="source"
							position={Position.Bottom}
							id="yes-bottom"
							aria-label="Yes"
							className="left-1/3! border-success!"
						/>
						<Handle
							type="source"
							position={Position.Bottom}
							id="no-bottom"
							aria-label="No"
							className="left-2/3! border-danger!"
						/>
					</>
				) : (
					sides.map((side) => <Handle key={side} type="source" position={side} id={`out-${side}`} />)
				))}
		</div>
	);
}
