import { cx } from "@trellis/ui";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { flowKinds } from "../../../kinds";
import { useFlowEditor } from "../../editorContext";
import type { CanvasNode } from "../../flowDraft";

// The card of an agent, a gate, or a human node. A gate has two outputs, YES
// above and NO below. Every other card has one output.
export function StepNode({ id, data, selected }: NodeProps<CanvasNode>) {
	const { personas, issues } = useFlowEditor();
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
			<Handle type="target" position={Position.Left} id="in" />
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
			{fields.kind === "gate" ? (
				<>
					<Handle type="source" position={Position.Right} id="yes" aria-label="Yes" className="top-1/3!" />
					<Handle type="source" position={Position.Right} id="no" aria-label="No" className="top-2/3!" />
				</>
			) : (
				<Handle type="source" position={Position.Right} id="out" />
			)}
		</div>
	);
}
