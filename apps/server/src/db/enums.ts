import {
	AgentRoleSchema,
	AgentRunnerSchema,
	AgentStateSchema,
	CiStateSchema,
	PrioritySchema,
	PrLinkSourceSchema,
	PrStateSchema,
	ReviewerSchema,
	ReviewStateSchema,
	RunnerReasonSchema,
	StatusCategorySchema,
	StoredActorKindSchema,
} from "@trellis/api";
import { getTableName, sql } from "drizzle-orm";
import { check, type PgColumn } from "drizzle-orm/pg-core";

// The closed sets the database accepts. Each one is the option list of the
// api enum, so the CHECK on a column and the schema on the wire agree.
export const PRIORITIES = PrioritySchema.options;
export const STATUS_CATEGORIES = StatusCategorySchema.options;
export const REVIEWERS = ReviewerSchema.options;
export const STORED_ACTOR_KINDS = StoredActorKindSchema.options;
export const PR_STATES = PrStateSchema.options;
export const CI_STATES = CiStateSchema.options;
export const REVIEW_STATES = ReviewStateSchema.options;
export const PR_LINK_SOURCES = PrLinkSourceSchema.options;
export const AGENT_ROLES = AgentRoleSchema.options;
export const AGENT_RUNNERS = AgentRunnerSchema.options;
export const AGENT_STATES = AgentStateSchema.options;
export const RUNNER_REASONS = RunnerReasonSchema.options;

// A CHECK named `<table>_<column>_check` that keeps a column inside a closed
// set. The options are inline literals: drizzle-kit copies the rendered SQL
// into the migration file, and a migration file cannot carry a parameter.
// A NULL value passes the check; a nullable column adds its own rule.
export const checkIn = (column: PgColumn, options: readonly string[]) => {
	const literals = options.map((option) => sql.raw(`'${option}'`));
	return check(
		`${getTableName(column.table)}_${column.name}_check`,
		sql`${column} IN (${sql.join(literals, sql`, `)})`,
	);
};
