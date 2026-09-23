import { type MemoryPressureLevel, memoryIsRed, type ThermalState, thermalIsRed } from "@trellis/api";

// What the computer reports right now. `memoryLevel` is null on a computer
// that publishes no kernel pressure level. `thermal` is null in a web browser,
// because only the macOS app reads a thermal state.
export type MemoryLevel = MemoryPressureLevel | null;

export type MachineSignals = {
	memoryLevel: MemoryLevel;
	thermal: ThermalState | null;
};

export type PressureWarning = {
	headline: string;
	consequences: string[];
};

// The warning for one moment, or null while both signals stay under their red
// line. The banner draws nothing for null, so a computer that recovers clears
// the banner at the next read.
export const pressureWarning = (signals: MachineSignals): PressureWarning | null => {
	const memory = memoryIsRed(signals.memoryLevel);
	const thermal = thermalIsRed(signals.thermal);
	if (!memory && !thermal) return null;
	const headline = memory
		? thermal
			? "The Mac has run out of memory, and macOS has cut its speed."
			: "The Mac has run out of memory."
		: "macOS has cut the speed of the Mac.";
	const consequences = [
		...(memory ? ["macOS can stop an agent run without warning."] : []),
		...(thermal ? ["macOS gives every agent run less processor time."] : []),
	];
	return { headline, consequences };
};
