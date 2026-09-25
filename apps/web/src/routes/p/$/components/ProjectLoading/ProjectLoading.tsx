import { useParams } from "@tanstack/react-router";
import { PageDetailLoading } from "../../../../../features/pages/PageDetail/components/PageDetailLoading";
import { ListPending } from "../../../../../features/table/ListPending";
import { parseProjectSplat } from "../../../../../lib/projectUrl";

import { PageListLoading } from "../PageListLoading";

export function ProjectLoading() {
	const params = useParams({ strict: false });
	const { view } = parseProjectSplat(params._splat ?? "");
	if (view === "pages") return <PageListLoading />;
	if (view === "page") return <PageDetailLoading />;
	return <ListPending view={view === "board" ? "board" : "table"} />;
}
