import { Button, ComposerTitle, ConfirmDialog, FailureState, Switch, TicketComposer } from "@trellis/ui";
import { AddAttachmentButton } from "../../attachments/AddAttachmentButton";
import { DropTarget } from "../../attachments/DropTarget";
import { UploadProgress } from "../../attachments/UploadProgress";
import { AgentPicker } from "./components/AgentPicker";
import { ChipRow } from "./components/ChipRow";
import { ComposerHeader } from "./components/ComposerHeader";
import { DescriptionField } from "./components/DescriptionField";

import { useTicketComposer } from "./components/useTicketComposer";

export function CreateTicketDialog({ open = true }: { open?: boolean }) {
	const {
		draft,
		setDraft,
		defaults,
		accounts,
		project,
		status,
		priority,
		parent,
		placement,
		choice,
		labels,
		description,
		uploads,
		submission,
		asking,
		setAsking,
		validation,
		editorKey,
		titleRef,
		titleId,
		errorId,
		locked,
		assignmentError,
		titleMissing,
		close,
		finish,
		create,
		action,
		onLabel,
		chooseClassification,
	} = useTicketComposer();
	return (
		<>
			<TicketComposer
				open={open}
				onOpenChange={(next) => !next && close()}
				title="New ticket"
				initialFocus={titleRef}
				onSubmit={(stay) => void create(stay)}
				header={
					<ComposerHeader
						project={project}
						disabled={submission.busy}
						locked={locked}
						onClose={close}
						onProject={(next) =>
							setDraft({ ...draft, project: next, epic: null, wave: null, parent: null, labels: [] })
						}
					/>
				}
				footer={
					<>
						<fieldset disabled={locked}>
							<AddAttachmentButton uploads={uploads} />
						</fieldset>
						<Switch
							label="Create another"
							checked={draft.createMore ?? false}
							onCheckedChange={(createMore) => setDraft({ ...draft, createMore })}
							disabled={submission.busy}
							className="composer-another"
						/>
						{submission.receipt && submission.failure?.stage === "assigning" && (
							<Button className="composer-keep" onClick={() => finish(false)}>
								Keep ticket
							</Button>
						)}
						<Button
							variant="primary"
							size="md"
							className="composer-create"
							processing={submission.busy}
							disabled={submission.receipt === null && (!placement.ready || !!assignmentError || !draft.title.trim())}
							onClick={() => void create()}
						>
							{action}
						</Button>
					</>
				}
			>
				<DropTarget
					identifier={submission.receipt?.identifier ?? "new ticket"}
					onFiles={(files) => {
						if (!locked) uploads.addFiles(files);
					}}
				>
					<div>
						<fieldset disabled={locked}>
							<label htmlFor={titleId} className="sr-only">
								Title
							</label>
							<ComposerTitle
								id={titleId}
								ref={titleRef}
								placeholder="Ticket title"
								autoComplete="off"
								aria-invalid={titleMissing || undefined}
								aria-describedby={titleMissing ? errorId : undefined}
								value={draft.title}
								onChange={(event) => setDraft({ ...draft, title: event.target.value })}
							/>
							<DescriptionField
								key={editorKey}
								markdown={description}
								editing={!locked && (draft.editing === true || draft.description !== "")}
								onEdit={() => {
									if (!locked) setDraft({ ...draft, editing: true });
								}}
								onChange={(markdown) => setDraft({ ...draft, description: markdown, editing: true })}
							/>
							<ChipRow
								project={project}
								statuses={defaults.statuses}
								status={status}
								priority={priority}
								automatic={draft.automatic}
								parent={parent}
								placement={placement}
								labels={labels}
								disabled={locked}
								onStatus={(next) => setDraft({ ...draft, status: next.slug })}
								onPriority={(priority) => chooseClassification({ priority })}
								onParent={(parent) => setDraft({ ...draft, parent })}
								onEpic={(epic) => chooseClassification({ epic, wave: null })}
								onWave={(wave) => chooseClassification({ wave })}
								onLabel={onLabel}
								onDiscard={() => setAsking(true)}
								agent={
									<AgentPicker
										value={choice}
										accounts={accounts.data}
										onChange={(assignment) => setDraft({ ...draft, assignment })}
										disabled={locked}
									/>
								}
							/>
						</fieldset>
						{(validation || assignmentError) && (
							<p id={errorId} role="alert" className="mt-2 text-xs text-danger">
								{validation ?? assignmentError}
							</p>
						)}
						{uploads.uploads.length > 0 && (
							<div className="mt-3 flex max-h-40 flex-col gap-2 overflow-y-auto">
								{uploads.uploads.map((upload) => (
									<UploadProgress
										key={upload.id}
										upload={upload}
										onDismiss={(id) => {
											if (!submission.busy) uploads.dismiss(id);
										}}
									/>
								))}
							</div>
						)}
						{submission.receipt && (
							<p role="status" className="mt-3 text-xs text-fg-muted">
								Ticket {submission.receipt.identifier} is saved.
							</p>
						)}
						{submission.failure && (
							<FailureState
								variant="section"
								className="mt-3 p-0"
								title={
									submission.failure.stage === "creating"
										? "The ticket did not save."
										: submission.failure.stage === "uploading"
											? "Some attachments did not upload."
											: "The assignment needs attention."
								}
								detail={submission.failure.detail}
							/>
						)}
					</div>
				</DropTarget>
			</TicketComposer>
			<ConfirmDialog
				open={asking}
				title="Discard this draft?"
				description="This removes the title, description, and selected attachments."
				confirmLabel="Discard draft"
				danger
				onCancel={() => setAsking(false)}
				onConfirm={() => {
					setAsking(false);
					finish(false);
				}}
			/>
		</>
	);
}
