import type { StatusSummary } from "@trellis/api";
import type { ReviewShape, StatusIconProps } from "@trellis/ui";

const reviewShapeOf = (status: StatusSummary): ReviewShape | undefined => {
	if (status.category !== "review") return undefined;
	if (status.slug === "deploy-queue") return "queue";
	return status.reviewer ?? undefined;
};

export const statusIconProps = (
	status: StatusSummary,
): Pick<StatusIconProps, "category" | "reviewer" | "reviewShape" | "color"> => ({
	category: status.category,
	reviewer: status.reviewer ?? undefined,
	reviewShape: reviewShapeOf(status),
	color: status.color,
});
