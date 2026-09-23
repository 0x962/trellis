import type { StatusSummary } from "@trellis/api";
import type { ReviewShape, StatusIconProps } from "@trellis/ui";

const reviewShapeOf = (status: StatusSummary): ReviewShape | undefined => {
	if (status.category !== "review") return undefined;
	if (status.slug === "deploy-queue") return "queue";
	return "human";
};

export const statusIconProps = (
	status: StatusSummary,
): Pick<StatusIconProps, "category" | "reviewShape" | "color"> => ({
	category: status.category,
	reviewShape: reviewShapeOf(status),
	color: status.color,
});
