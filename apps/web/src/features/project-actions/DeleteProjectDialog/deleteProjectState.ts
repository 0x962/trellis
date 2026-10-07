import { formatCount } from "../../../lib/format";

export type DeleteProjectStateInput = {
	projectKey: string;
	ticketCount: number | undefined;
	flowCount: number | undefined;
	typedKey: string;
	loading: boolean;
	failed: boolean;
	pending: boolean;
};

const ticketsText = (count: number) => `${formatCount(count)} ${count === 1 ? "ticket" : "tickets"}`;

const flowsText = (count: number) => `${formatCount(count)} ${count === 1 ? "flow" : "flows"}`;

export const deleteProjectState = ({
	projectKey,
	ticketCount,
	flowCount,
	typedKey,
	loading,
	failed,
	pending,
}: DeleteProjectStateInput) => {
	const loaded = ticketCount !== undefined && flowCount !== undefined && !loading && !failed;
	const needsKey = loaded && (ticketCount > 0 || flowCount > 0);
	return {
		loaded,
		needsKey,
		ready: loaded && (!needsKey || typedKey === projectKey) && !pending,
		description: loaded
			? `This permanently deletes ${projectKey} and all project data: ${ticketsText(ticketCount)}, ticket attachments, resources, Pages, and ${flowsText(flowCount)} with every step. You cannot undo this.`
			: "Trellis checks the tickets and flows before deletion.",
	};
};
