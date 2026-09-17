import { describe, expect, test } from "bun:test";
import { agentCandidates, completeMention, matchCandidates, mentionQuery, roleCandidates } from "./mentionQuery";

describe("chat/mentionQuery", () => {
	test("the query is the @ token under the caret", () => {
		expect(mentionQuery("hello @Bui", 10)).toEqual({ start: 6, query: "Bui" });
		expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
		expect(mentionQuery("mail a@b.c", 10)).toBeNull();
		expect(mentionQuery("@Builder done", 13)).toBeNull();
	});

	test("candidates that start with the query come before those that hold it", () => {
		const found = matchCandidates(
			[...roleCandidates, { id: "a", label: "Careful reviewer", insert: "@Careful reviewer" }],
			"rev",
		);
		expect(found.map((candidate) => candidate.label)).toEqual(["reviewers", "Careful reviewer"]);
	});

	test("a completion replaces the token and leaves the caret after one space", () => {
		expect(completeMention("ask @bui about it", 4, 8, "@Builder")).toEqual({
			text: "ask @Builder  about it",
			caret: 13,
		});
	});

	test("a shared persona name inserts the run id", () => {
		const [one, two, three] = agentCandidates([
			{ id: "01J8Z6X4Q3M2K1H0G9F8E7D6G1", personaName: "Review", kind: "reviewer" },
			{ id: "01J8Z6X4Q3M2K1H0G9F8E7D6G2", personaName: "Review", kind: "reviewer" },
			{ id: "01J8Z6X4Q3M2K1H0G9F8E7D6G3", personaName: "Trellis", kind: "manager" },
		]);
		expect(one!.insert).toBe("@01J8Z6X4Q3M2K1H0G9F8E7D6G1");
		expect(two!.insert).toBe("@01J8Z6X4Q3M2K1H0G9F8E7D6G2");
		expect(three!.insert).toBe("@Trellis");
	});
});
