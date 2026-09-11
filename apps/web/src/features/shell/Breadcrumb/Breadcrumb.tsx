import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { projectSlashPath } from "../../../lib/projectPath";
import { ProjectKey } from "../ProjectKey";

export type BreadcrumbProps = {
	// The API ref of the project: `CDE.web.auth`.
	path: string;
	// The page's own name. When set, it replaces the last segment as the
	// page heading, and the segments before it link to their projects.
	current?: string;
};

const linkClass =
	"inline-flex h-7 items-center rounded-md px-1 text-fg-muted transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// The project path of a page: the root key, then one slug per level. Each
// segment links to its project; a separator sits between them. The topbar
// title slot shrinks and the view switch beside it does not, so every box
// between the slot and the heading carries `min-w-0`. The heading then
// truncates before it reaches the switch. Below 640 px the bar has no room
// for both, so the key chip beside the heading leaves and the name keeps
// the width. The heading names the same project the chip does.
export function Breadcrumb({ path, current }: BreadcrumbProps) {
	const segments = path.split(".");
	const linked = current === undefined ? segments : segments.slice(0, -1);
	const own = current === undefined ? null : segments[segments.length - 1]!;
	return (
		<nav aria-label="Breadcrumb" className="min-w-0">
			<ol className="flex min-w-0 items-center gap-1">
				{linked.map((segment, index) => (
					<Fragment key={segment}>
						{index > 0 && <Separator />}
						<li>
							<Link
								to="/p/$"
								params={{ _splat: projectSlashPath(segments.slice(0, index + 1).join(".")) }}
								className={linkClass}
							>
								{index === 0 ? <ProjectKey projectKey={segment} /> : segment}
							</Link>
						</li>
					</Fragment>
				))}
				{own !== null && (
					<>
						{linked.length > 0 && <Separator />}
						<li className="flex min-w-0 items-center gap-2">
							{segments.length === 1 && <ProjectKey projectKey={own} className="max-sm:hidden" />}
							<h1 className="truncate text-lg font-semibold text-fg">{current}</h1>
						</li>
					</>
				)}
			</ol>
		</nav>
	);
}

function Separator() {
	return (
		<li aria-hidden="true" className="text-fg-faint">
			›
		</li>
	);
}
