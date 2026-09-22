import { Button as BaseButton } from "@base-ui/react/button";
import { type ComponentProps, cloneElement, type ReactElement, type ReactNode, useId } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { Kbd } from "../Kbd";
import { Spinner } from "../Spinner";
import { type ButtonVariant, buttonVariants, disabledLook } from "./variants";

export type { ButtonVariant } from "./variants";
export type ButtonSize = "sm" | "md";

export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "children" | "className"> & {
	className?: string;
	variant?: ButtonVariant;
	size?: ButtonSize;
	align?: "center" | "start";
	// A lucide icon element. It sits before the text at 16 px.
	icon?: ReactElement;
	// The shortcut, drawn as a Kbd key cap before the icon and the label. A
	// key cap is the same element here, in a row, and in a menu.
	kbd?: string;
	// True while the action the button started still runs. A turning ring
	// takes the icon slot, the label stays, and the button takes no second
	// click. Set it for every action that reaches the server, such as Start
	// or Stop.
	processing?: boolean;
	children: ReactNode;
};

const sizes: Record<ButtonSize, string> = {
	sm: `h-7 text-sm ${hitArea.box28Bordered}`,
	md: `h-8 text-base ${hitArea.box32Bordered}`,
};

// The side padding of each size. A key cap sits as far from the left edge
// as from the top edge: 4 px at sm and 6 px at md. So the 3 px corner of
// the cap follows the 8 px corner of the button.
const paddings: Record<ButtonSize, { plain: string; withKbd: string }> = {
	sm: { plain: "px-2.5", withKbd: "pr-2.5 pl-1" },
	md: { plain: "px-3", withKbd: "pr-3 pl-1.5" },
};

// The text button. The app has two button heights: sm is 28 px, for rows,
// bars, and headers, and md is 32 px, for dialogs, forms, and empty
// states. Both are at least 28 px wide. On a coarse pointer the size token
// draws both at 44 px in both axes, so a tap on the edge of one button
// never lands on the one beside it.
export function Button({
	variant = "default",
	size = "sm",
	align = "center",
	icon,
	kbd,
	processing = false,
	className,
	children,
	...props
}: ButtonProps) {
	const id = useId();
	const labelId = `${id}-label`;
	const shortcutId = `${id}-shortcut`;
	const padding = kbd ? paddings[size].withKbd : paddings[size].plain;

	return (
		<BaseButton
			aria-labelledby={kbd && !props["aria-label"] ? `${labelId} ${shortcutId}` : undefined}
			aria-busy={processing || undefined}
			className={cx(
				"inline-flex min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap select-none transition duration-hover ease-out",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				buttonVariants[variant],
				disabledLook(variant),
				sizes[size],
				padding,
				className,
			)}
			{...props}
			disabled={props.disabled === true || processing}
		>
			{kbd && (
				<Kbd id={shortcutId} className="shrink-0">
					{kbd}
				</Kbd>
			)}
			<span
				id={labelId}
				className={cx(
					"inline-flex flex-1 items-center gap-1.5",
					align === "start" ? "justify-start" : "justify-center",
				)}
			>
				{processing ? (
					<Spinner />
				) : (
					icon && (
						<span aria-hidden="true" className="inline-flex size-4 shrink-0 *:size-full">
							{cloneElement(icon as ReactElement<{ "aria-hidden"?: boolean }>, { "aria-hidden": true })}
						</span>
					)
				)}
				<span>{children}</span>
			</span>
		</BaseButton>
	);
}
