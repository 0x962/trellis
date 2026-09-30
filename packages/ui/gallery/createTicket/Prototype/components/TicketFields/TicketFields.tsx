import { Circle, DotsThree, Flag, FolderSimple, Paperclip, Tag, X } from "@phosphor-icons/react";
import { Button, FailureState, IconButton, PickerButton, Popover, Select, StatusIcon, Tooltip } from "../../../ui";
import { AgentFields } from "../AgentFields";
import type { ComposerState } from "../useComposer";

export function TicketFields({ state, onDiscard }: { state: ComposerState; onDiscard: () => void }) {
	return (
		<div className="ticket-fields">
			<div className="writing-area">
				<label htmlFor="ticket-title" className="sr-only">
					Ticket title
				</label>
				<textarea
					id="ticket-title"
					ref={state.titleRef}
					value={state.title}
					onChange={(event) => {
						state.setTitle(event.target.value);
						state.setTitleError(false);
					}}
					rows={1}
					placeholder="Ticket title"
					className="ticket-title"
					aria-invalid={state.titleError}
					aria-describedby={state.titleError ? "title-error" : undefined}
					readOnly={state.locked}
				/>
				{state.titleError && (
					<div id="title-error">
						<FailureState variant="inline" title="Enter a title for this ticket." />
					</div>
				)}
				<label htmlFor="ticket-description" className="sr-only">
					Description
				</label>
				<textarea
					id="ticket-description"
					value={state.description}
					onChange={(event) => state.setDescription(event.target.value)}
					placeholder="Add a description…"
					className="ticket-description"
					readOnly={state.locked}
				/>
			</div>
			{state.files.length > 0 && (
				<ul className="attachment-list" aria-label="Attachments">
					{state.files.map((file) => (
						<li key={file.id}>
							<Paperclip size={14} />
							<span>{file.name}</span>
							<Tooltip content={`Remove ${file.name}`}>
								<IconButton
									label={`Remove ${file.name}`}
									icon={<X />}
									size="xs"
									disabled={state.locked}
									onClick={() => state.setFiles(state.files.filter((item) => item.id !== file.id))}
								/>
							</Tooltip>
						</li>
					))}
				</ul>
			)}
			<fieldset className="ticket-properties">
				<legend className="sr-only">Ticket properties</legend>
				<Select
					label="Status"
					value={state.status}
					onValueChange={state.setStatus}
					disabled={state.locked}
					items={[
						{ value: "todo", label: "Todo", icon: <StatusIcon category="todo" /> },
						{ value: "started", label: "In Progress", icon: <StatusIcon category="started" /> },
					]}
				/>
				<Select
					label="Priority"
					value={state.priority}
					onValueChange={state.setPriority}
					disabled={state.locked}
					items={[
						{ value: "none", label: "Priority", icon: <Flag className="size-3.5" /> },
						{ value: "urgent", label: "Urgent", icon: <Flag className="size-3.5 text-danger" weight="fill" /> },
						{ value: "high", label: "High", icon: <Flag className="size-3.5 text-warning" /> },
						{ value: "normal", label: "Normal", icon: <Flag className="size-3.5" /> },
						{ value: "low", label: "Low", icon: <Flag className="size-3.5" /> },
					]}
				/>
				<AgentFields state={state} />
				<Popover
					label="Epic and wave"
					className="placement-popover"
					trigger={
						<PickerButton
							label="Epic and wave"
							size="sm"
							className="property-chip placement-chip"
							disabled={state.locked}
						>
							<span className="chip-content">
								<FolderSimple size={14} />
								September 29 review
							</span>
						</PickerButton>
					}
				>
					<div className="placement-heading">September 29 review</div>
					<Select
						label="Wave"
						hideLabel={false}
						value={state.wave}
						onValueChange={state.setWave}
						items={[
							{ value: "tabs", label: "Tabs" },
							{ value: "navigation", label: "Navigation" },
						]}
					/>
				</Popover>
				<Select
					label="Label"
					value={state.label}
					onValueChange={state.setLabel}
					disabled={state.locked}
					items={[
						{ value: "none", label: "Label", icon: <Tag className="size-3.5" /> },
						{ value: "feature", label: "Feature", icon: <Circle weight="fill" className="size-2 text-agent" /> },
						{ value: "bug", label: "Bug", icon: <Circle weight="fill" className="size-2 text-danger" /> },
					]}
				/>
				<Popover
					label="More ticket properties"
					triggerTooltip="More properties"
					trigger={<IconButton label="More properties" icon={<DotsThree />} disabled={state.locked} />}
				>
					<div className="more-properties">
						<Select
							label="Parent ticket"
							hideLabel={false}
							value={state.parent}
							onValueChange={state.setParent}
							items={[
								{ value: "none", label: "No parent" },
								{ value: "example", label: "Improve ticket navigation" },
							]}
						/>
						<Button variant="danger-soft" onClick={onDiscard} className="discard-action">
							Discard draft…
						</Button>
					</div>
				</Popover>
			</fieldset>
			{state.parent !== "none" && <p className="parent-note">Sub-ticket of Improve ticket navigation</p>}
		</div>
	);
}
