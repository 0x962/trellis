import { describe, expect, test } from "bun:test";
import { ListQuerySchema, StatusCategorySchema } from "@trellis/api";
import { categoryOf, listQueryInput, pageLimit, type Segment, sortOf } from "./listQuery";

const segments: Segment[] = ["active", "review", "done"];

describe("the ticket list query", () => {
	test("the three segments partition the status categories", () => {
		expect(categoryOf("active")).toEqual(["todo", "started"]);
		expect(categoryOf("review")).toEqual(["review"]);
		expect(categoryOf("done")).toEqual(["done", "canceled"]);

		const covered = segments.flatMap((segment) => categoryOf(segment));
		expect(covered.length).toBe(new Set(covered).size);
		expect([...covered].sort()).toEqual([...StatusCategorySchema.options].sort());
	});

	test("the sort toggle maps to the -updatedAt and priority sort fields", () => {
		expect(sortOf("updated")).toBe("-updatedAt");
		expect(sortOf("priority")).toBe("priority");
	});

	test("the built input parses against ListQuerySchema", () => {
		const input = listQueryInput({ project: "CDE.web", segment: "review", sort: "priority", cursor: "page-2" });

		expect(ListQuerySchema.parse(input)).toBeDefined();
		expect(Object.keys(input).sort()).toEqual(["category", "cursor", "limit", "project", "sort", "subprojects"]);
		expect(input).toEqual({
			project: "CDE.web",
			subprojects: false,
			category: ["review"],
			sort: "priority",
			limit: pageLimit,
			cursor: "page-2",
		});
	});
});
