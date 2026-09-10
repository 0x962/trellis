// `table` is the aligned text a TTY gets. `json` is the procedure output;
// a list is one array across every page. `jsonl` is one object per line.
// `quiet` is one identifier per line and wins over every other flag.
export type Mode = "table" | "json" | "jsonl" | "quiet";

// `color` is false under --no-color and on a pipe.
export type Format = { mode: Mode; color: boolean };

export type Writer = { write(text: string): void };

export type Column<T> = { name: string; value: (row: T) => string };

export type ListSpec<T> = { columns: Column<T>[]; identifier: (row: T) => string };

export type RecordSpec<T> = { fields: Column<T>[]; identifier: (row: T) => string };

const escapeByte = String.fromCharCode(27);

const ansiPattern = new RegExp(`${escapeByte}\\[[0-9;]*[A-Za-z]`, "g");

export const stripAnsi = (text: string): string => text.replaceAll(ansiPattern, "");

// A heading is the one place a TTY gets an escape sequence. Tables and
// records stay plain, so a reader can cut a column with a script.
export const heading = (text: string, color: boolean) =>
	color ? `${escapeByte}[1m${text}${escapeByte}[22m\n` : `${text}\n`;

export const json = (value: unknown): string => `${JSON.stringify(value)}\n`;

// A table cell holds one line. A null or empty value shows as a dash.
export const cell = (value: unknown): string => {
	if (value === null || value === undefined || value === "") return "-";
	return String(value).replace(/\s+/g, " ");
};

// Columns are padded to the widest cell and separated by two spaces. The
// last column is not padded, so no line ends in spaces.
export const renderTable = <T>(rows: T[], columns: Column<T>[]): string => {
	if (rows.length === 0) return "(none)\n";
	const cells = rows.map((row) => columns.map((column) => column.value(row)));
	const widths = columns.map((column, index) =>
		Math.max(column.name.length, ...cells.map((line) => line[index]!.length)),
	);
	const line = (values: string[]) =>
		values.map((value, index) => (index === values.length - 1 ? value : value.padEnd(widths[index]!))).join("  ");
	return `${[line(columns.map((column) => column.name)), ...cells.map(line)].join("\n")}\n`;
};

// One `key: value` per line, every value in one column.
export const renderRecord = <T>(row: T, fields: Column<T>[]): string => {
	const width = Math.max(...fields.map((field) => field.name.length)) + 1;
	return `${fields.map((field) => `${`${field.name}:`.padEnd(width)} ${field.value(row)}`).join("\n")}\n`;
};

export const printList = <T>(out: Writer, format: Format, rows: T[], spec: ListSpec<T>): void => {
	switch (format.mode) {
		case "quiet":
			out.write(rows.map((row) => `${spec.identifier(row)}\n`).join(""));
			return;
		case "json":
			out.write(json(rows));
			return;
		case "jsonl":
			out.write(rows.map(json).join(""));
			return;
		case "table":
			out.write(renderTable(rows, spec.columns));
			return;
	}
};

// A paged list prints page by page, so a reader sees rows before the next
// request goes out. `json` writes the one array as it grows: an opening
// bracket with the first row, a comma before every row after it, and the
// closing bracket when the last page is in. The bytes are the bytes of
// `JSON.stringify(everyRow)`. A table needs every row to size its columns,
// so a table waits for the last page.
export const printListPages = async <T>(
	out: Writer,
	format: Format,
	pages: AsyncIterable<T[]>,
	spec: ListSpec<T>,
): Promise<void> => {
	if (format.mode === "table") {
		const rows: T[] = [];
		for await (const page of pages) rows.push(...page);
		printList(out, format, rows, spec);
		return;
	}
	if (format.mode !== "json") {
		for await (const page of pages) printList(out, format, page, spec);
		return;
	}
	let written = 0;
	for await (const page of pages) {
		for (const row of page) {
			out.write(`${written === 0 ? "[" : ","}${JSON.stringify(row)}`);
			written++;
		}
	}
	out.write(written === 0 ? "[]\n" : "]\n");
};

export const printRecord = <T>(out: Writer, format: Format, row: T, spec: RecordSpec<T>): void => {
	switch (format.mode) {
		case "quiet":
			out.write(`${spec.identifier(row)}\n`);
			return;
		case "json":
		case "jsonl":
			out.write(json(row));
			return;
		case "table":
			out.write(renderRecord(row, spec.fields));
			return;
	}
};

// The fields the ticket table reads. A TicketSummary has them all; the type
// names only what the renderer touches, so any row with them prints.
export type TicketRow = {
	identifier: string;
	title: string;
	priority: string;
	status: { slug: string };
	updatedAt: string;
};

export const ticketList: ListSpec<TicketRow> = {
	columns: [
		{ name: "identifier", value: (row) => row.identifier },
		{ name: "status", value: (row) => row.status.slug },
		{ name: "priority", value: (row) => row.priority },
		{ name: "title", value: (row) => cell(row.title) },
		{ name: "updated", value: (row) => row.updatedAt },
	],
	identifier: (row) => row.identifier,
};

// The fields the ticket block reads. A Ticket has them all.
export type TicketFields = TicketRow & {
	status: { slug: string; category: string };
	project: { path: string };
	parent: { identifier: string } | null;
	childCount: number;
	childDoneCount: number;
	commentCount: number;
	attachmentCount: number;
	pr: { state: string; ciState: string } | null;
	lastActor: { kind: string; name: string } | null;
	version: number;
	createdAt: string;
	completedAt: string | null;
};

// The description is not a field: it has many lines, so `show` prints it
// below the block.
export const ticketRecord: RecordSpec<TicketFields> = {
	fields: [
		{ name: "identifier", value: (row) => row.identifier },
		{ name: "title", value: (row) => cell(row.title) },
		{ name: "status", value: (row) => `${row.status.slug} (${row.status.category})` },
		{ name: "priority", value: (row) => row.priority },
		{ name: "project", value: (row) => row.project.path },
		{ name: "parent", value: (row) => cell(row.parent?.identifier) },
		{ name: "children", value: (row) => `${row.childDoneCount}/${row.childCount} done` },
		{ name: "comments", value: (row) => String(row.commentCount) },
		{ name: "attachments", value: (row) => String(row.attachmentCount) },
		{ name: "pr", value: (row) => (row.pr === null ? "-" : `${row.pr.state}, ci ${row.pr.ciState}`) },
		{
			name: "lastActor",
			value: (row) => (row.lastActor === null ? "-" : `${row.lastActor.kind}:${row.lastActor.name}`),
		},
		{ name: "version", value: (row) => String(row.version) },
		{ name: "created", value: (row) => row.createdAt },
		{ name: "updated", value: (row) => row.updatedAt },
		{ name: "completed", value: (row) => cell(row.completedAt) },
	],
	identifier: (row) => row.identifier,
};
