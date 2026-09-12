import { CornersOut, MagicWand, Minus, Plus } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import { useReactFlow } from "@xyflow/react";

type CanvasControlsProps = { onCleanUp: () => void; canCleanUp: boolean };

// The view controls of the flow canvas, with Clean up beside them.
export function CanvasControls({ onCleanUp, canCleanUp }: CanvasControlsProps) {
	const rf = useReactFlow();
	const controls = [
		{ label: "Zoom in", icon: <Plus />, onClick: () => void rf.zoomIn(), disabled: false },
		{ label: "Zoom out", icon: <Minus />, onClick: () => void rf.zoomOut(), disabled: false },
		{
			label: "Fit the flow in view",
			icon: <CornersOut />,
			onClick: () => void rf.fitView({ maxZoom: 1 }),
			disabled: false,
		},
		{ label: "Clean up the layout", icon: <MagicWand />, onClick: onCleanUp, disabled: !canCleanUp },
	];
	return (
		<div role="toolbar" aria-label="Canvas" className="flex items-center gap-1">
			{controls.map((control) => (
				<Tooltip key={control.label} content={control.label} side="top">
					<IconButton label={control.label} icon={control.icon} disabled={control.disabled} onClick={control.onClick} />
				</Tooltip>
			))}
		</div>
	);
}
