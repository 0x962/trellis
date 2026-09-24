import { CaretDown } from "@phosphor-icons/react";
import { cx } from "@trellis/ui";
import type { ComponentPropsWithRef } from "react";

export type TitleMenuButtonProps = ComponentPropsWithRef<"button"> & {
	// The page name, drawn before the caret.
	label: string;
};

// The page name in the top bar, drawn as the trigger of a menu or a popover.
// The caret stays visible at all times, so a person sees that the page name
// opens a list. A primitive such as `Menu` or `Popover` takes this button as
// its `trigger` and passes the open and close props through `rest`.
export function TitleMenuButton({ label, className, ...rest }: TitleMenuButtonProps) {
	return (
		<button
			type="button"
			{...rest}
			className={cx(
				"flex h-7 max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-left transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 data-[popup-open]:bg-band max-md:h-11 pointer-coarse:h-11",
				className,
			)}
		>
			<span className="min-w-0 truncate">{label}</span>
			<CaretDown aria-hidden="true" weight="bold" className="size-4 shrink-0 text-fg" />
		</button>
	);
}
