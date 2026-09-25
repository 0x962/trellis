import { useParams } from "@tanstack/react-router";
import { PagePending } from "../../../../../features/pages/PageDetail/components/PagePending";
import { ListPending } from "../../../../../features/table/ListPending";
import { parseProjectSplat } from "../../../../../lib/projectUrl";

import { PageListPending } from "../PageListPending";

export function ProjectPending() {
	const params = useParams({ strict: false });
	const { view } = parseProjectSplat(params._splat ?? "");
	if (view === "pages") return <PageListPending />;
	if (view === "page") return <PagePending />;
	return <ListPending view={view === "board" ? "board" : "table"} />;
}
