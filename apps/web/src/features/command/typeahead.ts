// The keys typed after the palette opens and before its search field holds
// the focus. The palette query takes them, so a fast typist loses no key
// and no page hotkey acts on one.
type Update = (query: string) => string;

let buffered = "";
let sink: ((update: Update) => void) | null = null;

// With no field attached, the key waits in `buffered`.
const deliver = (update: Update) => {
	if (sink === null) buffered = update(buffered);
	else sink(update);
};

export const paletteTypeahead = {
	// A printable key appends its character. Backspace drops the last one.
	key: (key: string) => deliver(key === "Backspace" ? (query) => query.slice(0, -1) : (query) => query + key),
	// The query of the open palette takes the held keys now and each later
	// key until the field holds the focus. The result detaches it.
	attach: (next: (update: Update) => void) => {
		sink = next;
		const held = buffered;
		buffered = "";
		if (held !== "") next((query) => query + held);
		return () => {
			sink = null;
		};
	},
	clear: () => {
		buffered = "";
	},
};
