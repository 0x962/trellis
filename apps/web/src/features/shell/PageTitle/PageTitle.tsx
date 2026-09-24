import { cx } from "@trellis/ui";
import type { ReactNode } from "react";

export type PageTitleProps = {
	// A link to the page above this one, drawn before the title and a slash.
	// A top-level page passes none.
	parent?: ReactNode;
	// The page name, or a control that holds it, such as the epic switcher.
	title: ReactNode;
};

// The title of a page in the topbar: the parent link in muted text, a
// slash, and the page name in the page heading. Every page names itself
// this one way.
//
// A name that arrives as text is cut with an ellipsis by the heading. A
// control keeps its own box, which can paint a hover fill and a focus
// outline outside the text, so the heading holds no clip for it and the
// control cuts its own label.
export function PageTitle({ parent, title }: PageTitleProps) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			{parent !== undefined && (
				<>
					<span className="shrink-0 text-lg text-fg-muted *:transition-colors *:duration-hover *:hover:text-fg">
						{parent}
					</span>
					<span aria-hidden="true" className="text-fg-faint">
						/
					</span>
				</>
			)}
			<h1 className={cx("text-lg font-semibold text-fg", typeof title === "string" ? "truncate" : "flex min-w-0")}>
				{title}
			</h1>
		</div>
	);
}
