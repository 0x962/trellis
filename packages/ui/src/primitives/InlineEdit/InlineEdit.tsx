import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "../../utils/cx";
import { Input } from "../Input";
import { toast } from "../Toast";
import { type InlineEditEvent, type InlineEditFocus, inlineEditAction, runInlineEdit } from "./inlineEditRules";

export type InlineEditProps = {
	// The accessible name of the text field, such as "Session name". A screen
	// reader reads it. The screen shows no label.
	label: string;
	// The value the record holds now.
	value: string;
	// True while the text field stands in place of `children`. The screen owns
	// it, because the Rename action that starts the edit sits in a row menu
	// outside this component.
	editing: boolean;
	onEditingChange: (editing: boolean) => void;
	// Sends the new value to the server. It must reject when the server
	// refuses, because a refusal keeps the field open.
	onSave: (value: string) => Promise<void>;
	// The first line of the message a refusal shows, such as "The session name
	// did not change."
	errorTitle?: string;
	// A mark that stands left of the text field, such as the avatar of the row.
	// It keeps the row from moving sideways when the field opens.
	leading?: ReactNode;
	// The class of the box that holds both states.
	className?: string;
	// The class of the line that holds `leading` and the text field. It sets
	// the height of the line and the space between the mark and the field.
	fieldClassName?: string;
	// The class of the text field itself. Use it to match the type size of the
	// value that the field covers.
	inputClassName?: string;
	// The value at rest: the plain text, the heading or the row that the field
	// covers while the edit runs.
	children?: ReactNode;
};

/**
 * The one way to edit a short value in place. Every screen that renames a
 * thing uses this component, so a person meets the same rules everywhere.
 * `inlineEditRules.ts` holds those rules in words, as `inlineEditRules`, and
 * holds the ones that need no React and no DOM as plain functions. The tests
 * beside it state each one.
 *
 * Two rules the list does not state, because they are about the screen and not
 * about the edit:
 *
 * - At rest the screen draws its own value through `children`, and the edit
 *   starts from the Rename action of the row menu, or from a double click that
 *   the screen puts on the value.
 * - Inside a row that is a link or a button, the screen draws no row while the
 *   field is open, and the text field stops its own clicks and key presses
 *   from reaching the row. A key press in the field never navigates.
 */
export function InlineEdit({
	label,
	value,
	editing,
	onEditingChange,
	onSave,
	errorTitle = "The server refused the new value.",
	leading,
	className,
	fieldClassName,
	inputClassName,
	children,
}: InlineEditProps) {
	const [draft, setDraft] = useState(value);
	const [saving, setSaving] = useState(false);
	// Counts the refusals of this edit. A count, and not a flag, makes the
	// effect below run again when the same value is refused a second time.
	const [refusals, setRefusals] = useState(0);
	// Holds what `editing` was on the last draw, so the field can take the
	// saved value while React draws it. An effect would run after the browser
	// paints, and a re-opened field would show one frame of the old draft.
	const [openOnLastDraw, setOpenOnLastDraw] = useState(editing);
	const box = useRef<HTMLDivElement>(null);
	const field = useRef<HTMLInputElement>(null);
	// True from the first moment of an ending until the field closes. The text
	// field loses the focus while it disappears, and that second blur must not
	// save the value again.
	const editEnded = useRef(false);

	if (editing !== openOnLastDraw) {
		setOpenOnLastDraw(editing);
		if (editing) {
			setDraft(value);
			setSaving(false);
			setRefusals(0);
			editEnded.current = false;
		}
	}

	// The browser must draw the text field before anything can focus it.
	useEffect(() => {
		if (!editing) return;
		field.current?.focus();
		field.current?.select();
	}, [editing]);

	// The text field is disabled while the server answers, and a disabled field
	// takes no focus. The focus therefore waits for the redraw that enables the
	// field again.
	useEffect(() => {
		if (refusals > 0) field.current?.focus();
	}, [refusals]);

	const close = (focus: InlineEditFocus) => {
		editEnded.current = true;
		setSaving(false);
		onEditingChange(false);
		if (focus === "value") box.current?.focus();
	};

	const endEdit = async (event: InlineEditEvent) => {
		if (editEnded.current) return;
		const outcome = await runInlineEdit(event, draft, value, onSave, {
			onSaving: () => {
				editEnded.current = true;
				setSaving(true);
			},
		});
		if (outcome.kind === "typing") return;
		if (outcome.kind === "refused") {
			editEnded.current = false;
			setSaving(false);
			setRefusals((count) => count + 1);
			toast.error(errorTitle, { description: outcome.message });
			return;
		}
		close(outcome.focus);
	};

	const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (inlineEditAction({ kind: "key", key: event.key }, draft, value).kind === "ignore") return;
		// The field can stand inside a row that is a link. Enter must not
		// follow that link, and Escape must not close the page over it.
		event.preventDefault();
		void endEdit({ kind: "key", key: event.key });
	};

	// The row around the field can be a link or a button. A click or a key
	// press in the field must not reach that row while the field is open.
	const stopEvent = (event: { stopPropagation: () => void }) => event.stopPropagation();

	return (
		<div
			ref={box}
			tabIndex={-1}
			data-inline-edit={editing ? "editing" : "value"}
			// The rows that this box wraps draw their own focus ring at
			// `rounded-md` and two pixels inside their edge. The box matches
			// them, so the ring does not change shape when the edit ends.
			className={cx(
				"min-w-0 rounded-md outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
				className,
			)}
		>
			{editing ? (
				<div className={cx("flex min-w-0 items-center", fieldClassName)}>
					{leading}
					<div className="min-w-0 flex-1">
						<Input
							ref={field}
							label={label}
							hideLabel
							value={draft}
							disabled={saving}
							invalid={refusals > 0}
							className={cx("min-w-0", inputClassName)}
							onChange={(event) => {
								setDraft(event.target.value);
								setRefusals(0);
							}}
							onKeyDown={keyDown}
							onBlur={() => void endEdit({ kind: "blur" })}
							onClick={stopEvent}
							onDoubleClick={stopEvent}
							onKeyUp={stopEvent}
						/>
					</div>
				</div>
			) : (
				children
			)}
		</div>
	);
}
