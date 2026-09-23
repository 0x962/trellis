import { expect, test } from "bun:test";
import type { StatusSummary } from "@trellis/api";
import { statusIconProps } from "./statusIconProps";

const status = (fields: Partial<StatusSummary>): StatusSummary => ({
	id: "01M00000000000000000000000",
	slug: "agent-review",
	name: "Agent Review",
	category: "review",
	color: "agent",
	...fields,
});

test("deploy queue uses its own review mark shape", () => {
	expect(statusIconProps(status({ slug: "deploy-queue", name: "Deploy Queue", color: "fg" }))).toMatchObject({
		reviewShape: "queue",
		color: "fg",
	});
});

test("every other review status draws the dashed ring", () => {
	expect(statusIconProps(status({ slug: "agent-review" }))).toMatchObject({ reviewShape: "human" });
	expect(statusIconProps(status({ slug: "human-review", color: "warning" }))).toMatchObject({
		reviewShape: "human",
		color: "warning",
	});
});

test("a status outside the review category has no mark shape", () => {
	expect(statusIconProps(status({ slug: "todo", category: "todo", color: "fg-muted" }))).toMatchObject({
		reviewShape: undefined,
	});
});
