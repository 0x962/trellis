import { PencilSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { InlineEdit } from "../../../../primitives/InlineEdit";
import { inlineEditRules } from "../../../../primitives/InlineEdit/inlineEditRules";
import { Section } from "../../Section";

export function InlineEditSection() {
	const [title, setTitle] = useState("Restore the export pages");
	const [editingTitle, setEditingTitle] = useState(false);
	const [branch, setBranch] = useState("trl-404-one-way-to-edit");
	const [editingBranch, setEditingBranch] = useState(false);
	const [editingRefusal, setEditingRefusal] = useState(false);
	return (
		<Section name="Inline edit" note="the one way to edit a short value in place" className="items-start">
			<div className="flex w-full flex-col gap-4">
				<ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-fg-muted">
					{inlineEditRules.map((rule) => (
						<li key={rule}>{rule}</li>
					))}
				</ol>
				<div className="flex flex-col gap-2">
					<p className="text-sm text-fg-muted">A heading. The pencil starts the edit, and so does a double click.</p>
					<div className="flex items-center gap-2">
						<InlineEdit
							label="Ticket title"
							value={title}
							editing={editingTitle}
							onEditingChange={setEditingTitle}
							onSave={async (value) => setTitle(value)}
							inputClassName="h-9 text-lg font-semibold"
							className="min-w-60"
						>
							<h3 className="truncate text-lg font-semibold text-fg" onDoubleClick={() => setEditingTitle(true)}>
								{title}
							</h3>
						</InlineEdit>
						<IconButton
							label="Rename the ticket"
							icon={<PencilSimple />}
							size="xs"
							onClick={() => setEditingTitle(true)}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<p className="text-sm text-fg-muted">A row that is a link. Enter and Escape never follow the link.</p>
					<div className="flex w-72 items-center gap-1">
						<InlineEdit
							label="Branch name"
							value={branch}
							editing={editingBranch}
							onEditingChange={setEditingBranch}
							onSave={async (value) => setBranch(value)}
							className="min-w-0 flex-1"
							fieldClassName="sidebar-item"
							inputClassName="h-7 text-sm"
						>
							<a href="#branch" className="sidebar-item">
								<span className="min-w-0 flex-1 truncate">{branch}</span>
							</a>
						</InlineEdit>
						{!editingBranch && (
							<IconButton
								label="Rename the branch"
								icon={<PencilSimple />}
								size="xs"
								onClick={() => setEditingBranch(true)}
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
							onSave={async () => {
								throw new Error("Too big: expected string to have <=60 characters");
							}}
							errorTitle="The name did not change."
							className="min-w-0 flex-1"
							fieldClassName="sidebar-item"
							inputClassName="h-7 text-sm"
						>
							<span className="sidebar-item">Already in use</span>
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
