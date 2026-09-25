import { ORPCError } from "@orpc/client";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { NotFoundState } from "../../../../../features/shell/NotFoundState";
import { PageTitle } from "../../../../../features/shell/PageTitle";
import { Topbar } from "../../../../../features/shell/Topbar";
import { ProjectLoadError } from "../ProjectLoadError";

export function ProjectError({ error }: ErrorComponentProps) {
	if (error instanceof ORPCError && error.code === "NOT_FOUND") {
		const { ref } = error.data as { ref: string };
		return (
			<>
				<Topbar>
					<PageTitle title={ref} />
				</Topbar>
				<NotFoundState ref={ref} />
			</>
		);
	}
	return <ProjectLoadError error={error} />;
}
