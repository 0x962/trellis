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
			<h1 className="truncate text-lg font-semibold text-fg">{title}</h1>
		</div>
	);
}
