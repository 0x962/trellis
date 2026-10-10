import { sql } from "drizzle-orm";
import { check, doublePrecision, foreignKey, index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { checkIn, PRIORITIES } from "../../enums.ts";
import { at } from "../actors.ts";
import { epics } from "../epics.ts";
import { hosts } from "../hosts/index.ts";
import { projects, statuses } from "../projects.ts";
import { waves } from "../waves.ts";

// A ticket is numbered inside its project, so (project_id, number) gives it
// the identifier KEY-n. The status foreign key accepts any status; the
// owner rule is checked in the service. Each foreign key is RESTRICT: the
// delete of a row a ticket still points at fails at once, inside the
// statement that deletes it. The epic foreign key is the exception: an
// epic delete sets `epic_id` NULL on its tickets. The rule that the epic
// belongs to the project of the ticket is a service rule, because a
// composite foreign key cannot SET NULL one column alone. The wave foreign
// key sets `wave_id` NULL in the same way, and the service holds the rule
// that the wave belongs to the epic of the ticket.
// The generated column `search` (title at weight A, description at weight
// B) and its GIN index live in the migration 0002_constraints, because
// drizzle-kit renders no generated tsvector. The GIN index on title with
// gin_trgm_ops lives in the migration 0002_constraints too, because
// drizzle-kit renders no operator class.
export const tickets = pgTable(
	"tickets",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "restrict" }),
		number: integer().notNull(),
		title: text().notNull(),
		description: text().notNull().default(""),
		result: text().notNull().default(""),
		files: jsonb().notNull().default([]),
		leaveAlone: jsonb("leave_alone").notNull().default([]),
		verify: jsonb().notNull().default([]),
		reviewFocus: jsonb("review_focus").notNull().default([]),
		outcome: text().notNull().default(""),
		priority: text().notNull().default("none"),
		statusId: text("status_id")
			.notNull()
			.references(() => statuses.id, { onDelete: "restrict" }),
		parentId: text("parent_id"),
		epicId: text("epic_id"),
		waveId: text("wave_id"),
		position: doublePrecision().notNull(),
		version: integer().notNull().default(1),
		startedAt: at("started_at"),
		completedAt: at("completed_at"),
		// The host a run of this ticket takes. NULL means the project default,
		// then the workspace default.
		hostId: text("host_id").references(() => hosts.id),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("tickets_project_id_number_unique").on(t.projectId, t.number),
		unique("tickets_id_project_id_unique").on(t.id, t.projectId),
		foreignKey({
			name: "tickets_parent_fk",
			columns: [t.parentId, t.projectId],
			foreignColumns: [t.id, t.projectId],
		}).onDelete("restrict"),
		foreignKey({
			name: "tickets_epic_fk",
			columns: [t.epicId],
			foreignColumns: [epics.id],
		}).onDelete("set null"),
		foreignKey({
			name: "tickets_wave_fk",
			columns: [t.waveId],
			foreignColumns: [waves.id],
		}).onDelete("set null"),
		// A row never loses its epic while it holds a wave. A service
		// that deletes an epic sets `wave_id` NULL on its tickets first.
		check("tickets_wave_needs_epic", sql`${t.waveId} IS NULL OR ${t.epicId} IS NOT NULL`),
		check("tickets_parent_not_self", sql`${t.parentId} <> ${t.id}`),
		check("tickets_number_check", sql`${t.number} > 0`),
		check("tickets_title_check", sql`${t.title} = btrim(${t.title}) AND length(${t.title}) >= 1`),
		check("tickets_files_check", sql`jsonb_typeof(${t.files}) = 'array'`),
		check("tickets_leave_alone_check", sql`jsonb_typeof(${t.leaveAlone}) = 'array'`),
		check("tickets_verify_check", sql`jsonb_typeof(${t.verify}) = 'array'`),
		check("tickets_review_focus_check", sql`jsonb_typeof(${t.reviewFocus}) = 'array'`),
		checkIn(t.priority, PRIORITIES),
		index("tickets_project_id_status_id_position_idx").on(t.projectId, t.statusId, t.position),
		// The `position` sort reads a status in (position, id) order and
		// filters it by project. Every column it reads is in this index, so
		// it is read from the index alone, with no table row.
		index("tickets_status_id_position_id_idx").on(t.statusId, t.position, t.id, t.projectId),
		// The explicit Updated sort uses this index within a status.
		index("tickets_status_id_updated_at_id_idx").on(
			t.statusId,
			t.updatedAt.desc().nullsFirst(),
			t.id.desc().nullsFirst(),
			t.projectId,
		),
		index("tickets_parent_id_idx").on(t.parentId),
		index("tickets_epic_id_idx").on(t.epicId),
		index("tickets_wave_id_idx").on(t.waveId),
		index("tickets_host_id_idx").on(t.hostId),
		index("tickets_open_idx").on(t.projectId, t.updatedAt.desc().nullsFirst()).where(sql`${t.completedAt} IS NULL`),
		index("tickets_completed_idx")
			.on(t.projectId, t.completedAt.desc().nullsFirst())
			.where(sql`${t.completedAt} IS NOT NULL`),
	],
);
