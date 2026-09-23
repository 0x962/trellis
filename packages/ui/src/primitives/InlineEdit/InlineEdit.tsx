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
	onCommit: (value: string) => Promise<void>;
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
 * `inlineEditRules.ts` holds rules 1 to 4, rule 6 and rule 7 as plain
 * functions, and the tests beside it state each one.
 *
 * The rules:
 *
 * 1. Enter saves the typed value. Losing the focus also saves it. A person who
 *    types a name and clicks away keeps the name.
 * 2. Escape cancels, and only Escape. The saved value comes back.
 * 3. An empty value, or a value of spaces alone, cancels. The field sends
 *    nothing.
 * 4. A value equal to the saved one closes the field. The field sends nothing.
 * 5. The new value waits for the server. The field stays open and takes no
 *    more typing until the server answers, and the screen shows the new value
 *    after the server accepts it.
 * 6. When the server refuses, the field stays open, keeps the typed value,
 *    draws the red border and takes the focus back. A message names the
 *    reason.
 * 7. After Enter and after Escape the focus goes to the box that holds the
 *    value, so the next Tab starts from the value. After a click outside, the
 *    focus stays where the person clicked.
 * 8. At rest the value is plain text at the size of the text beside it. It
 *    draws no box, no pencil and no underline. The edit starts from the Rename
 *    action of the row menu, or from a double click that the screen puts on
 *    the value.
 * 9. Inside a row that is a link or a button, the row is not drawn while the
 *    field is open, and the text field stops its own clicks and key presses
 *    from reaching the row. A key press in the field never navigates.
 */
export function InlineEdit({
	label,
	value,
	editing,
	onEditingChange,
	onCommit,
	errorTitle = "The server refused the new value.",
	leading,
	className,
	fieldClassName,
	inputClassName,
	children,
}: InlineEditProps) {
	const [draft, setDraft] = useState(value);
	const [saving, setSaving] = useState(false);
	const [refused, setRefused] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	const field = useRef<HTMLInputElement>(null);
	// True from the first moment of an ending until the field closes. The text
	// field loses the focus while it disappears, and that second blur must not
	// save the value again.
	const ending = useRef(false);

	// The field takes the value that the record holds at the moment the edit
	// opens. A later answer from the server must not overwrite the text a
	// person is typing, so `value` is not a dependency here.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the field reads `value` one time, when the edit opens.
	useEffect(() => {
		if (!editing) return;
		setDraft(value);
		setSaving(false);
		setRefused(false);
		ending.current = false;
		field.current?.focus();
		field.current?.select();
	}, [editing]);

	const close = (focus: InlineEditFocus) => {
		ending.current = true;
		setSaving(false);
		onEditingChange(false);
		if (focus === "value") box.current?.focus();
	};

	const end = async (event: InlineEditEvent) => {
		if (ending.current) return;
		const outcome = await runInlineEdit(event, draft, value, onCommit, () => {
			ending.current = true;
			setSaving(true);
		});
		if (outcome.kind === "typing") return;
		if (outcome.kind === "refused") {
			ending.current = false;
			setSaving(false);
			setRefused(true);
			field.current?.focus();
			toast.error(errorTitle, { description: outcome.message });
			return;
		}
		close(outcome.focus);
	};

	const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (inlineEditAction({ kind: "key", key: event.key }, draft, value).kind === "type") return;
		// The field can stand inside a row that is a link. Enter must not
		// follow that link, and Escape must not close the page over it.
		event.preventDefault();
		void end({ kind: "key", key: event.key });
	};

	// The text field swallows its own click and key press. The row around it
	// can be a link or a button, and neither may fire while the field is open.
	const swallow = (event: { stopPropagation: () => void }) => event.stopPropagation();

	return (
		<div
			ref={box}
			tabIndex={-1}
			data-inline-edit={editing ? "editing" : "value"}
			className={cx("min-w-0 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-accent", className)}
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
							invalid={refused}
							className={cx("min-w-0", inputClassName)}
							onChange={(event) => {
								setDraft(event.target.value);
								setRefused(false);
							}}
							onKeyDown={keyDown}
							onBlur={() => void end({ kind: "blur" })}
							onClick={swallow}
							onDoubleClick={swallow}
							onKeyUp={swallow}
						/>
					</div>
				</div>
			) : (
				children
			)}
		</div>
	);
}
