import { PencilSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { IconButton } from "../../../primitives/IconButton";
import { InlineEdit } from "../../../primitives/InlineEdit";
import { Section } from "../Section";

// The rule a screen follows when it lets a person edit a short value in
// place. `InlineEdit` holds all of it, and the list below is the same rule in
// words.
const rules = [
	"Enter saves the typed value. Losing the focus also saves it.",
	"Escape cancels, and only Escape. The saved value comes back, and Escape cancels an empty field too.",
	'An empty value, or a value of spaces alone, is refused. The field stays open and says "Enter a name.".',
	"A value equal to the saved one closes the field. The field sends nothing.",
	"The new value waits for the server. The field takes no more typing until the server answers.",
	"A refusal keeps the field open with the typed value, draws the red border, takes the focus back, and names the reason.",
	"Enter and Escape give the focus to the value. A click outside leaves the focus where the person clicked.",
	"At rest the value is plain text at the size of the text beside it: no box, no pencil, no underline.",
	"Inside a row that is a link, the row is not drawn while the field is open, and no key press navigates.",
];

const rowClass =
	"flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-fg transition-colors duration-hover ease-out hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

export function InlineEditSection() {
	const [name, setName] = useState("Restore the export pages");
	const [editingName, setEditingName] = useState(false);
	const [rowName, setRowName] = useState("trl-404-one-way-to-edit");
	const [editingRow, setEditingRow] = useState(false);
	const [editingRefusal, setEditingRefusal] = useState(false);
	return (
		<Section name="Inline edit" note="the one way to edit a short value in place" className="items-start">
			<div className="flex w-full flex-col gap-4">
				<ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-fg-muted">
					{rules.map((rule) => (
						<li key={rule}>{rule}</li>
					))}
				</ol>
				<div className="flex flex-col gap-2">
					<p className="text-sm text-fg-muted">A heading. The pencil starts the edit, and so does a double click.</p>
					<div className="flex items-center gap-2">
						<InlineEdit
							label="Ticket title"
							value={name}
							editing={editingName}
							onEditingChange={setEditingName}
							onCommit={async (next) => setName(next)}
							inputClassName="h-9 text-lg font-semibold"
							className="min-w-60"
						>
							<h3 className="truncate text-lg font-semibold text-fg" onDoubleClick={() => setEditingName(true)}>
								{name}
							</h3>
						</InlineEdit>
						<IconButton
							label="Rename the ticket"
							icon={<PencilSimple />}
							size="xs"
							onClick={() => setEditingName(true)}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<p className="text-sm text-fg-muted">A row that is a link. Enter and Escape never follow the link.</p>
					<div className="flex w-72 items-center gap-1">
						<InlineEdit
							label="Branch name"
							value={rowName}
							editing={editingRow}
							onEditingChange={setEditingRow}
							onCommit={async (next) => setRowName(next)}
							className="min-w-0 flex-1"
							inputClassName="h-7 text-sm"
						>
							<a href="#branch" className={rowClass}>
								<span className="min-w-0 flex-1 truncate">{rowName}</span>
							</a>
						</InlineEdit>
						{!editingRow && (
							<IconButton
								label="Rename the branch"
								icon={<PencilSimple />}
								size="xs"
								onClick={() => setEditingRow(true)}
							/>
						)}
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<p className="text-sm text-fg-muted">
						A server that refuses. The field keeps the typed value. Clear the field and press Enter to read the empty
						message.
					</p>
					<div className="flex w-72 items-center gap-1">
						<InlineEdit
							label="Taken name"
							value="Already in use"
							editing={editingRefusal}
							onEditingChange={setEditingRefusal}
							onCommit={async () => {
								throw new Error("Too big: expected string to have <=60 characters");
							}}
							errorTitle="The name did not change."
							className="min-w-0 flex-1"
							inputClassName="h-7 text-sm"
						>
							<span className={rowClass}>Already in use</span>
						</InlineEdit>
						{!editingRefusal && (
							<IconButton
								label="Rename the taken name"
								icon={<PencilSimple />}
								size="xs"
								onClick={() => setEditingRefusal(true)}
							/>
						)}
					</div>
				</div>
			</div>
		</Section>
	);
}
