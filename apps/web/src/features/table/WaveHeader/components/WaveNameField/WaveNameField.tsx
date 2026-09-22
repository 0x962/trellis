import { WAVE_NAME_MAX } from "@trellis/api";
import { Input } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";

export type WaveNameFieldProps = {
	name: string;
	// Receives the text when the field closes: on Enter and on blur. Escape
	// closes the field with the stored name.
	onFinish: (name: string) => void;
};

// The name of a wave as a text field inside its header. The field opens
// with the text selected, so typing replaces the name.
export function WaveNameField({ name, onFinish }: WaveNameFieldProps) {
	const [text, setText] = useState(name);
	const input = useRef<HTMLInputElement>(null);
	// Enter and Escape close the field, and the blur that follows must not
	// close it a second time.
	const done = useRef(false);

	useEffect(() => {
		input.current!.focus();
		input.current!.select();
	}, []);

	const finish = (value: string) => {
		if (done.current) return;
		done.current = true;
		onFinish(value);
	};

	return (
		<div className="w-60 min-w-0 max-md:flex-1">
			<Input
				ref={input}
				label="Wave name"
				hideLabel
				autoComplete="off"
				maxLength={WAVE_NAME_MAX}
				value={text}
				onChange={(event) => setText(event.target.value)}
				onBlur={() => finish(text)}
				onKeyDown={(event) => {
					if (event.key === "Enter") finish(text);
					if (event.key === "Escape") finish(name);
					// The header reads F2 and Alt+Shift+arrows, and the field keeps them.
					event.stopPropagation();
				}}
				className="h-7 pointer-coarse:h-11"
			/>
		</div>
	);
}
