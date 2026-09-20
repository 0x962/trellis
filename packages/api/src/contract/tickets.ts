import { pickErrors } from "../errors.ts";
import {
	BoardOutputSchema,
	BoardQuerySchema,
	CountsOutputSchema,
	CountsQuerySchema,
	ListOutputSchema,
	ListQuerySchema,
	TicketGetInputSchema,
	TicketSchema,
} from "../schemas/ticket.ts";
import {
	TicketAnswerInputSchema,
	TicketAnswerOutputSchema,
	TicketContractInputSchema,
	TicketCreateInputSchema,
	TicketDeleteInputSchema,
	TicketDeleteManyInputSchema,
	TicketDeleteManyOutputSchema,
	TicketDeleteOutputSchema,
	TicketImportContractInputSchema,
	TicketImportContractOutputSchema,
	TicketImportDependenciesInputSchema,
	TicketImportDependenciesOutputSchema,
	TicketMoveInputSchema,
	TicketOutcomeInputSchema,
	TicketUpdateDependenciesInputSchema,
	TicketUpdateInputSchema,
	TicketUpdateManyInputSchema,
	TicketUpdateManyOutputSchema,
} from "../schemas/ticketWrite.ts";
import { base } from "./base.ts";

// The codes a write to one or many tickets can raise.
const writeErrors = pickErrors([
	"PROJECT_ARCHIVED",
	"STATUS_NOT_IN_PROJECT",
	"CROSS_ROOT_MOVE",
	"MILESTONE_OUTSIDE_EPIC",
	"PARENT_CYCLE",
	"LABEL_AMBIGUOUS",
]);

// The `label` and `labelNot` filters take label refs, and a bare name can
// match more than one label.
const filterErrors = pickErrors(["LABEL_AMBIGUOUS"]);

export const tickets = {
	list: base
		.errors(filterErrors)
		.errors(pickErrors(["INVALID_CURSOR"]))
		.route({ method: "GET", path: "/tickets", summary: "List tickets by the shared filter grammar" })
		.input(ListQuerySchema)
		.output(ListOutputSchema),
	counts: base
		.errors(filterErrors)
		.route({ method: "GET", path: "/tickets/counts", summary: "Count tickets per status under the same filters" })
		.input(CountsQuerySchema)
		.output(CountsOutputSchema),
	board: base
		.errors(filterErrors)
		.route({ method: "GET", path: "/tickets/board", summary: "Read the kanban columns in one query" })
		.input(BoardQuerySchema)
		.output(BoardOutputSchema),
	get: base
		.route({
			method: "GET",
			path: "/tickets/{ticket}",
			summary: "Read one ticket with its children, PRs, and attachments",
		})
		.input(TicketGetInputSchema)
		.output(TicketSchema),
	create: base
		.errors(writeErrors)
		.route({ method: "POST", path: "/tickets", successStatus: 201, summary: "Create a ticket" })
		.input(TicketCreateInputSchema)
		.output(TicketSchema),
	update: base
		.errors(writeErrors)
		.errors(pickErrors(["VERSION_CONFLICT"]))
		.route({ method: "PATCH", path: "/tickets/{ticket}", summary: "Change ticket fields" })
		.input(TicketUpdateInputSchema)
		.output(TicketSchema),
	move: base
		.errors(pickErrors(["INVALID_ANCHOR", "VERSION_CONFLICT", "PROJECT_ARCHIVED", "STATUS_NOT_IN_PROJECT"]))
		.route({ method: "POST", path: "/tickets/{ticket}/move", summary: "Move a ticket to a status and a position" })
		.input(TicketMoveInputSchema)
		.output(TicketSchema),
	updateMany: base
		.errors(writeErrors)
		.route({ method: "POST", path: "/tickets/update-many", summary: "Change up to 200 tickets in one transaction" })
		.input(TicketUpdateManyInputSchema)
		.output(TicketUpdateManyOutputSchema),
	deleteMany: base
		.errors(pickErrors(["AGENT_CANNOT_DELETE", "PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/tickets/delete-many", summary: "Delete up to 200 tickets in one transaction" })
		.input(TicketDeleteManyInputSchema)
		.output(TicketDeleteManyOutputSchema),
	delete: base
		.errors(pickErrors(["AGENT_CANNOT_DELETE", "PROJECT_ARCHIVED"]))
		.route({ method: "DELETE", path: "/tickets/{ticket}", summary: "Delete a ticket" })
		.input(TicketDeleteInputSchema)
		.output(TicketDeleteOutputSchema),
	importContract: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/tickets/import-contract", summary: "Import contract fields from one epic" })
		.input(TicketImportContractInputSchema)
		.output(TicketImportContractOutputSchema),
	importDependencies: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/tickets/import-dependencies", summary: "Import dependency edges from one epic" })
		.input(TicketImportDependenciesInputSchema)
		.output(TicketImportDependenciesOutputSchema),
	updateDependencies: base
		.errors(pickErrors(["DEPENDENCY_CYCLE", "PROJECT_ARCHIVED", "VERSION_CONFLICT"]))
		.route({
			method: "PATCH",
			path: "/tickets/{ticket}/dependencies",
			summary: "Add and remove ticket dependencies in one transaction",
		})
		.input(TicketUpdateDependenciesInputSchema)
		.output(TicketSchema),
	setContract: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "VERSION_CONFLICT"]))
		.route({ method: "PUT", path: "/tickets/{ticket}/contract", summary: "Set the contract of a ticket" })
		.input(TicketContractInputSchema)
		.output(TicketSchema),
	setOutcome: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "VERSION_CONFLICT"]))
		.route({ method: "PUT", path: "/tickets/{ticket}/outcome", summary: "Set the outcome of a ticket" })
		.input(TicketOutcomeInputSchema)
		.output(TicketSchema),
	answer: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "VERSION_CONFLICT", "STATUS_NOT_IN_PROJECT"]))
		.route({
			method: "POST",
			path: "/tickets/{ticket}/answer",
			successStatus: 201,
			summary: "Answer a question ticket",
		})
		.input(TicketAnswerInputSchema)
		.output(TicketAnswerOutputSchema),
};
