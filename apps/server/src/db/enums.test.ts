import { describe, expect, test } from "bun:test";
import {
	CiStateSchema,
	NoteAudienceSchema,
	PrioritySchema,
	PrLinkSourceSchema,
	PrStateSchema,
	ReviewerSchema,
	ReviewStateSchema,
	StatusCategorySchema,
	StoredActorKindSchema,
} from "@trellis/api";
import { PgDialect, pgTable, text } from "drizzle-orm/pg-core";
import {
	CI_STATES,
	checkIn,
	NOTE_AUDIENCES,
	PR_LINK_SOURCES,
	PR_STATES,
	PRIORITIES,
	REVIEW_STATES,
	REVIEWERS,
	STATUS_CATEGORIES,
	STORED_ACTOR_KINDS,
} from "./enums.ts";

describe("closed sets", () => {
	test("every closed set equals the api enum options in order", () => {
		expect(PRIORITIES).toEqual(PrioritySchema.options);
		expect(STATUS_CATEGORIES).toEqual(StatusCategorySchema.options);
		expect(REVIEWERS).toEqual(ReviewerSchema.options);
		expect(STORED_ACTOR_KINDS).toEqual(StoredActorKindSchema.options);
		expect(PR_STATES).toEqual(PrStateSchema.options);
		expect(CI_STATES).toEqual(CiStateSchema.options);
		expect(REVIEW_STATES).toEqual(ReviewStateSchema.options);
		expect(PR_LINK_SOURCES).toEqual(PrLinkSourceSchema.options);
		expect(NOTE_AUDIENCES).toEqual(NoteAudienceSchema.options);
	});

	// drizzle-kit copies the rendered SQL of a check into the migration, so
	// the options are inline literals and never bound parameters.
	test("the CHECK builder renders a named IN list", () => {
		const probe = pgTable("probe", { kind: text("kind").notNull() });
		const built = checkIn(probe.kind, ["a", "b", "c"]);
		expect(built.name).toBe("probe_kind_check");
		const query = new PgDialect().sqlToQuery(built.value);
		expect(query.params).toEqual([]);
		const rendered = query.sql.replaceAll('"', "").replace(/^probe\./, "");
		expect(rendered).toMatch(/^kind IN \('a', 'b', 'c'\)$/i);
	});
});
