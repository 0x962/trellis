import { expect, test } from "bun:test";
import type { StatusSummary } from "@trellis/api";
import { statusIconProps } from "./statusIconProps";

const status = (fields: Partial<StatusSummary>): StatusSummary => ({
	id: "01M00000000000000000000000",
	slug: "agent-review",
	name: "Agent Review",
	category: "review",
	reviewer: "agent",
	color: "agent",
	...fields,
});

test("deploy queue uses its own review mark shape", () => {
	expect(statusIconProps(status({ slug: "deploy-queue", name: "Deploy Queue", color: "fg" }))).toMatchObject({
		reviewShape: "queue",
		color: "fg",
	});
});

test("reviewer statuses keep their reviewer mark shape", () => {
	expect(statusIconProps(status({ slug: "agent-review", reviewer: "agent" }))).toMatchObject({
		reviewShape: "agent",
	});
	expect(statusIconProps(status({ slug: "human-review", reviewer: "human", color: "warning" }))).toMatchObject({
		reviewShape: "human",
		color: "warning",
	});
});
