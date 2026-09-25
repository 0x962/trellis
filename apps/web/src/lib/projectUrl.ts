import { notFound } from "@tanstack/react-router";
import { ProjectRefStringSchema, slugPattern } from "@trellis/api";

export type ProjectView = "table" | "board" | "settings" | "notes" | "diffs" | "epics" | "epic" | "pages" | "page";

export type ProjectSplat = {
	ref: string;
	view: ProjectView;
	// The epic slug of the `epic` view: `/p/OP/epics/routine-runtime`.
	epic?: string;
	// The Page slug of the `page` view: `/p/OP/pages/release-report`.
	page?: string;
};

// A project URL is `/p/<ref>` followed by a reserved view segment. The
// `epics/<slug>` and `pages/<slug>` forms name one record inside a view.
// `board` stays reserved because `/p/CDE/board` resolves to the bare board.
const views: ReadonlySet<string> = new Set(["board", "table", "settings", "notes", "diffs", "epics", "pages"]);

// Takes the view segments off the end of the splat and returns them. The
// `epic` and `page` views take a collection segment and a slug. Every other
// view takes one segment. An unknown segment leaves the splat whole and
// selects the board.
const popView = (segments: string[]): { view: ProjectView; epic?: string; page?: string } => {
	const last = segments[segments.length - 1];
	const beforeLast = segments[segments.length - 2];
	if (
		segments.length === 3 &&
		last !== undefined &&
		(beforeLast?.toLowerCase() === "epics" || beforeLast?.toLowerCase() === "pages") &&
		slugPattern.test(last.toLowerCase())
	) {
		segments.pop();
		segments.pop();
		return beforeLast.toLowerCase() === "epics"
			? { view: "epic", epic: last.toLowerCase() }
			: { view: "page", page: last.toLowerCase() };
	}
	if (last !== undefined && views.has(last.toLowerCase())) {
		return { view: segments.pop()!.toLowerCase() as ProjectView };
	}
	return { view: "board" };
};

export const parseProjectSplat = (splat: string): ProjectSplat => {
	const segments = splat.split("/").filter((segment) => segment !== "");
	const { view, epic, page } = popView(segments);
	if (segments.length !== 1) throw notFound();
	const ref = ProjectRefStringSchema.safeParse(segments[0] as string);
	if (!ref.success) throw notFound();
	if (epic !== undefined) return { ref: ref.data, view, epic };
	return page === undefined ? { ref: ref.data, view } : { ref: ref.data, view, page };
};

// `/p/CDE/table`; the board writes no segment, because it is the view a
// project opens in.
export const projectHref = (ref: string, view: Exclude<ProjectView, "epic" | "page"> = "board") =>
	`/p/${ref}${view === "board" ? "" : `/${view}`}`;

// The sessions page of one project: `/sessions/project/TRL`.
export const projectSessionsHref = (ref: string) => `/sessions/project/${ref}`;

// The page of one epic: `/p/OP/epics/routine-runtime`.
export const epicHref = (ref: string, slug: string) => `${projectHref(ref, "epics")}/${slug}`;

export const pageHref = (ref: string, slug: string) => `${projectHref(ref, "pages")}/${slug}`;

// The `/p/$` splat of an epic page from the epic ref. An epic ref is
// `KEY/slug`, and the epic page is `/p/KEY/epics/slug`.
export const epicSplat = (epicRef: string) => epicRef.replace("/", "/epics/");

// True when the pathname is the page of one epic: `/p/OP/epics/<slug>`.
export const isEpicPathname = (pathname: string): boolean =>
	pathname.startsWith("/p/") &&
	popView(
		pathname
			.slice(3)
			.split("/")
			.filter((segment) => segment !== ""),
	).view === "epic";

// The epic ref of an epic page pathname, or null on every other page:
// `OP/routine-runtime` for `/p/OP/epics/routine-runtime`.
export const epicRefOfPathname = (pathname: string): string | null => {
	if (!pathname.startsWith("/p/")) return null;
	const segments = pathname
		.slice(3)
		.split("/")
		.filter((segment) => segment !== "");
	const { epic } = popView(segments);
	return epic === undefined ? null : `${segments[0]}/${epic}`;
};

// The view of a valid `/p/...` pathname, or null for a different route or
// an invalid project path.
export const projectViewOfPathname = (pathname: string): ProjectView | null => {
	if (!pathname.startsWith("/p/")) return null;
	const segments = pathname
		.slice(3)
		.split("/")
		.filter((segment) => segment !== "");
	const { view } = popView(segments);
	if (segments.length !== 1) return null;
	return ProjectRefStringSchema.safeParse(segments[0] as string).success ? view : null;
};

// The API ref of a `/p/...` pathname, or null when the pathname is not a
// project route or holds an invalid segment. The sidebar marks the active
// row with it, so a bad URL never crashes the sidebar.
export const projectRefOfPathname = (pathname: string): string | null => {
	if (pathname.startsWith("/sessions/project/")) {
		const ref = ProjectRefStringSchema.safeParse(pathname.slice("/sessions/project/".length));
		return ref.success ? ref.data : null;
	}
	if (!pathname.startsWith("/p/")) return null;
	const segments = pathname
		.slice(3)
		.split("/")
		.filter((segment) => segment !== "");
	popView(segments);
	if (segments.length !== 1) return null;
	const ref = ProjectRefStringSchema.safeParse(segments[0] as string);
	return ref.success ? ref.data : null;
};
