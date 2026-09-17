import { CaretDown } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cx } from "../../utils/cx";
import { Button, type ButtonProps } from "../Button";
import { IconButton } from "../IconButton";
import { Menu, type MenuItem } from "../Menu";

export type SplitButtonProps = Omit<ButtonProps, "children"> & {
	children: ReactNode;
	menuLabel: string;
	items: readonly MenuItem[];
	onMenuOpenChange?: (open: boolean) => void;
};

export function SplitButton({
	children,
	menuLabel,
	items,
	onMenuOpenChange,
	className,
	disabled,
	processing,
	...button
}: SplitButtonProps) {
	return (
		<span className="inline-flex items-center">
			<Button
				className={cx("rounded-r-none focus-visible:z-1", className)}
				disabled={disabled}
				processing={processing}
				{...button}
			>
				{children}
			</Button>
			<Menu
				label={menuLabel}
				triggerTooltip={menuLabel}
				items={items}
				onOpenChange={onMenuOpenChange}
				trigger={
					<IconButton
						label={menuLabel}
						icon={<CaretDown />}
						size={button.size}
						variant={button.variant}
						disabled={disabled || processing}
						className="-ml-px rounded-l-none focus-visible:z-1"
					/>
				}
			/>
		</span>
	);
}
