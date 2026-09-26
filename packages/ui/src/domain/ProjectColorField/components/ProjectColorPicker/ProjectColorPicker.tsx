import { type AriaAttributes, useEffect, useId, useRef, useState } from "react";
import { PickerButton } from "../../../../primitives/PickerButton";
import { Popover } from "../../../../primitives/Popover";
import { ProjectMark } from "../../../ProjectMark";
import { projectColorLabels } from "../../../projectColors";
import type { ProjectColorFieldProps } from "../../ProjectColorField";
import { ProjectColorGrid } from "../ProjectColorGrid";

type ProjectColorPickerProps = ProjectColorFieldProps & AriaAttributes & { id?: string };

export function ProjectColorPicker({
	value,
	taken,
	onValueChange,
	label = "Color",
	disabled,
	onBlur,
	...aria
}: ProjectColorPickerProps) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const selectedOptionRef = useRef<HTMLSpanElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const frameId = useRef<number | undefined>(undefined);
	const focused = useRef(false);
	const valueId = useId();
	useEffect(() => () => cancelAnimationFrame(frameId.current ?? 0), []);
	const handleOpenChange = (next: boolean) => {
		if (!next && panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
		setOpen(next);
	};
	return (
		<div
			onFocusCapture={() => {
				cancelAnimationFrame(frameId.current ?? 0);
				focused.current = true;
			}}
			onBlurCapture={() => {
				cancelAnimationFrame(frameId.current ?? 0);
				// Base UI restores focus after the portal closes. Wait for that focus move before a form saves.
				frameId.current = requestAnimationFrame(() => {
					const active = document.activeElement;
					if (focused.current && active !== triggerRef.current && !panelRef.current?.contains(active)) {
						focused.current = false;
						onBlur?.();
					}
				});
			}}
		>
			<Popover
				label={label}
				open={open}
				onOpenChange={handleOpenChange}
				initialFocus={selectedOptionRef}
				trigger={
					<PickerButton
						{...aria}
						ref={triggerRef}
						type="button"
						disabled={disabled}
						label={`${label}: ${value === null ? "None" : projectColorLabels[value]}`}
						aria-labelledby={aria["aria-labelledby"] ? `${aria["aria-labelledby"]} ${valueId}` : undefined}
						leading={
							value === null ? (
								<ProjectMark color={null} />
							) : (
								<span
									aria-hidden="true"
									data-project-color={value}
									className="project-swatch size-4 shrink-0 rounded-sm"
								/>
							)
						}
					>
						<span id={valueId}>{value === null ? "None" : projectColorLabels[value]}</span>
					</PickerButton>
				}
			>
				<div ref={panelRef} tabIndex={-1} className="outline-none">
					<ProjectColorGrid
						selectedOptionRef={selectedOptionRef}
						value={value}
						taken={taken}
						label={label}
						onValueChange={(next) => {
							onValueChange(next);
							triggerRef.current?.focus();
							setOpen(false);
						}}
					/>
				</div>
			</Popover>
		</div>
	);
}
