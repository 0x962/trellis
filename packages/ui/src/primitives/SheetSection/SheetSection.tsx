import type { ReactNode } from "react";
import { cx } from "../../utils/cx";

type SheetSectionProps = { title: string; children: ReactNode; divided?: boolean };

export function SheetSection({ title, children, divided = false }: SheetSectionProps) {
	return (
		<section aria-label={title} className={cx("flex flex-col gap-4", divided && "border-t border-border pt-6")}>
			<h3 className="text-md font-medium text-fg">{title}</h3>
			{children}
		</section>
	);
}
