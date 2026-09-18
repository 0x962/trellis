export type EscapeLayer = "popover" | "selection" | "navigation";
export type EscapeHandler = (() => boolean) | (() => void);

const order: EscapeLayer[] = ["popover", "selection", "navigation"];
type Registration = { layer: EscapeLayer; handle: EscapeHandler };
type EscapeEvent = Pick<KeyboardEvent, "key" | "defaultPrevented" | "repeat" | "isComposing" | "preventDefault">;

export const createEscapeLayers = () => {
	const registrations: Registration[] = [];
	return {
		register(layer: EscapeLayer, handle: EscapeHandler) {
			const registration = { layer, handle };
			registrations.push(registration);
			return () => {
				registrations.splice(registrations.indexOf(registration), 1);
			};
		},
		handle(event: EscapeEvent) {
			if (event.key !== "Escape" || event.defaultPrevented || event.repeat || event.isComposing) return;
			for (const layer of order) {
				for (const registration of registrations.toReversed()) {
					if (registration.layer !== layer || registration.handle() === false) continue;
					event.preventDefault();
					return;
				}
			}
		},
	};
};
