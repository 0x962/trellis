import { ArrowClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { FailureState, IconButton, Tooltip } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { parseProjectSplat } from "../../../../../../../lib/projectUrl";
import type { PublishedPageSubject } from "../../../../../../../stores/pageSheetStore";
import { PageDetail } from "../../../../../../pages/PageDetail";
import { PageDetailLoading } from "../../../../../../pages/PageDetail/components/PageDetailLoading";

export function PublishedPageContent({ subject }: { subject: PublishedPageSubject }) {
	const { orpc } = useApp();
	const { ref, page } = parseProjectSplat(subject.ref);
	const project = useQuery({ ...orpc.projects.get.queryOptions({ input: { project: ref } }), retry: false });
	if (project.isPending) return <PageDetailLoading />;
	if (project.isError)
		return (
			<FailureState
				variant="page"
				title="The project did not load"
				detail={project.error.message}
				action={
					<Tooltip content="Retry">
						<IconButton label="Retry" icon={<ArrowClockwise />} onClick={() => void project.refetch()} />
					</Tooltip>
				}
			/>
		);
	return <PageDetail project={project.data} slug={page!} search={{ version: subject.version }} />;
}
