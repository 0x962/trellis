import { CaretDown } from "@phosphor-icons/react";
import { type AriaAttributes, useEffect, useId, useRef, useState } from "react";
import { Popover } from "../../../../primitives/Popover";
import { ProjectMark } from "../../../ProjectMark";
import { projectColorLabels } from "../../../projectColors";
import type { ProjectColorFieldProps } from "../../ProjectColorField";
import { ProjectColorGrid } from "../ProjectColorGrid";

type Props = ProjectColorFieldProps & AriaAttributes & { id?: string };

export function ProjectColorControl({ value, taken, onValueChange, label, disabled, onBlur, ...aria }: Props) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const panel = useRef<HTMLDivElement>(null);
	const frame = useRef<number | undefined>(undefined);
	const focused = useRef(false);
	const valueId = useId();
	useEffect(() => () => cancelAnimationFrame(frame.current ?? 0), []);
	const changeOpen = (next: boolean) => {
		if (!next && panel.current?.contains(document.activeElement)) trigger.current?.focus();
		setOpen(next);
	};
	return (
		<div
			onFocusCapture={() => {
				cancelAnimationFrame(frame.current ?? 0);
				focused.current = true;
			}}
			onBlurCapture={() => {
				cancelAnimationFrame(frame.current ?? 0);
				// Base UI restores focus after the portal closes. Wait for that focus move before a form saves.
				frame.current = requestAnimationFrame(() => {
					const active = document.activeElement;
					if (focused.current && active !== trigger.current && !panel.current?.contains(active)) {
						focused.current = false;
						onBlur?.();
					}
				});
			}}
		>
			<Popover
				label={label}
				open={open}
				onOpenChange={changeOpen}
				initialFocus={panel}
				trigger={
					<button
						{...aria}
						ref={trigger}
						type="button"
						disabled={disabled}
						aria-label={
							aria["aria-labelledby"] ? undefined : `${label}: ${value === null ? "None" : projectColorLabels[value]}`
						}
						aria-labelledby={aria["aria-labelledby"] ? `${aria["aria-labelledby"]} ${valueId}` : undefined}
						className="inline-flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-base text-fg outline-none transition-colors duration-hover hover:border-border-strong active:bg-control-active focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-11 max-sm:h-11"
					>
						<ProjectMark color={value} />
						<span id={valueId} className="min-w-0 flex-1 truncate text-left">
							{value === null ? "None" : projectColorLabels[value]}
						</span>
						<CaretDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-faint" />
					</button>
				}
			>
				<div ref={panel} tabIndex={-1} className="outline-none">
					<ProjectColorGrid
						value={value}
						taken={taken}
						label={label}
						onValueChange={(next) => {
							onValueChange(next);
							trigger.current?.focus();
							setOpen(false);
						}}
					/>
				</div>
			</Popover>
		</div>
	);
}
