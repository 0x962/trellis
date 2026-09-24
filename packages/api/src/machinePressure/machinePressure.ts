import type { MemoryPressureLevel, ThermalState } from "../schemas/system.ts";

export const machinePressureSignalKeys = ["cpuLoad", "memory", "thermal", "temperature"] as const;
export type MachinePressureSignalKey = (typeof machinePressureSignalKeys)[number];
export type MachinePressureTier = "normal" | "warning" | "danger";
export type MachinePressureFreshness = "live" | "stale" | "unavailable" | "lost";
export type TemperatureReaderState = "available" | "unavailable" | "failed" | "lost";

export type TimedReading<T> = {
	value: T;
	sampledAt: number;
};

export type TemperatureReading = TimedReading<number> & {
	sensor: string;
	readDurationMs: number;
};

export type MachinePressureReadings = {
	cpuLoad: TimedReading<number> | null;
	memory: TimedReading<MemoryPressureLevel> | null;
	thermal: TimedReading<ThermalState> | null;
	temperature: TemperatureReading | null;
	temperatureReader: TemperatureReaderState;
};

type NumericPolicy = {
	warningAt: number;
	dangerAt: number;
	warningDwellMs: number;
	dangerDwellMs: number;
	warningRecoveryBelow: number;
	dangerRecoveryBelow: number;
	recoveryDwellMs: number;
	staleAfterMs: number;
	lostAfterMs: number;
};

// These values control the Trellis indicator. They are operational display
// thresholds, not processor throttle limits or native pressure levels.
export const MACHINE_PRESSURE_POLICY = {
	cpuLoad: {
		warningAt: 2,
		dangerAt: 4,
		warningDwellMs: 10_000,
		dangerDwellMs: 10_000,
		warningRecoveryBelow: 1.5,
		dangerRecoveryBelow: 3,
		recoveryDwellMs: 60_000,
		staleAfterMs: 15_000,
		lostAfterMs: 60_000,
	},
	memory: {
		warningAt: 2,
		dangerAt: 4,
		warningDwellMs: 60_000,
		dangerDwellMs: 0,
		warningRecoveryBelow: 2,
		dangerRecoveryBelow: 4,
		recoveryDwellMs: 30_000,
		staleAfterMs: 15_000,
		lostAfterMs: 60_000,
	},
	thermal: {
		warningAt: 1,
		dangerAt: 2,
		warningDwellMs: 60_000,
		dangerDwellMs: 0,
		warningRecoveryBelow: 1,
		dangerRecoveryBelow: 2,
		recoveryDwellMs: 60_000,
		staleAfterMs: 15_000,
		lostAfterMs: 60_000,
	},
	temperature: {
		warningAt: 85,
		dangerAt: 95,
		warningDwellMs: 15_000,
		dangerDwellMs: 15_000,
		warningRecoveryBelow: 80,
		dangerRecoveryBelow: 88,
		recoveryDwellMs: 60_000,
		staleAfterMs: 15_000,
		lostAfterMs: 60_000,
	},
} as const satisfies Record<MachinePressureSignalKey, NumericPolicy>;

export type MachinePressureSignalState<T> = {
	key: MachinePressureSignalKey;
	tier: MachinePressureTier;
	freshness: MachinePressureFreshness;
	reading: TimedReading<T> | null;
};

export type MachinePressureState = {
	cpuLoad: MachinePressureSignalState<number>;
	memory: MachinePressureSignalState<MemoryPressureLevel>;
	thermal: MachinePressureSignalState<ThermalState>;
	temperature: MachinePressureSignalState<number> & { reading: TemperatureReading | null };
};

type Transition = { tier: MachinePressureTier; since: number };
type StoredSignal<T> = {
	tier: MachinePressureTier;
	transition: Transition | null;
	reading: TimedReading<T> | null;
};
type SignalAvailability = "unavailable" | "failed" | "lost" | null;

const initialSignal = <T>(): StoredSignal<T> => ({ tier: "normal", transition: null, reading: null });

const thermalScore = (state: ThermalState): number => {
	if (state === "fair") return 1;
	if (state === "serious" || state === "critical") return 2;
	return 0;
};

const tierFor = (value: number, policy: NumericPolicy): MachinePressureTier => {
	if (value >= policy.dangerAt) return "danger";
	if (value >= policy.warningAt) return "warning";
	return "normal";
};

const transitionAfter = (
	stored: StoredSignal<unknown>,
	tier: MachinePressureTier,
	now: number,
	dwellMs: number,
): boolean => {
	if (stored.transition?.tier !== tier) stored.transition = { tier, since: now };
	if (now - stored.transition.since < dwellMs) return false;
	stored.tier = tier;
	stored.transition = null;
	return true;
};

const updateTier = (stored: StoredSignal<unknown>, value: number, policy: NumericPolicy, now: number) => {
	const measuredTier = tierFor(value, policy);
	if (stored.tier === "normal") {
		if (measuredTier === "normal") {
			stored.transition = null;
			return;
		}
		transitionAfter(
			stored,
			measuredTier,
			now,
			measuredTier === "danger" ? policy.dangerDwellMs : policy.warningDwellMs,
		);
		return;
	}
	if (stored.tier === "warning") {
		if (measuredTier === "danger") {
			transitionAfter(stored, "danger", now, policy.dangerDwellMs);
			return;
		}
		if (value < policy.warningRecoveryBelow) {
			transitionAfter(stored, "normal", now, policy.recoveryDwellMs);
			return;
		}
		stored.transition = null;
		return;
	}
	if (value >= policy.dangerRecoveryBelow) {
		stored.transition = null;
		return;
	}
	const recoveredTier = value < policy.warningRecoveryBelow ? "normal" : "warning";
	transitionAfter(stored, recoveredTier, now, policy.recoveryDwellMs);
};

const freshnessOf = <T>(
	stored: StoredSignal<T>,
	reading: TimedReading<T> | null,
	now: number,
	staleAfterMs: number,
	lostAfterMs: number,
	availability: SignalAvailability,
): MachinePressureFreshness => {
	if (availability === "unavailable") {
		stored.tier = "normal";
		stored.transition = null;
		stored.reading = null;
		return "unavailable";
	}
	if (availability === "lost") {
		stored.tier = "normal";
		stored.transition = null;
		stored.reading = null;
		return "lost";
	}
	const current = reading ?? (availability === "failed" ? stored.reading : null);
	if (current === null) {
		stored.tier = "normal";
		stored.transition = null;
		stored.reading = null;
		return "unavailable";
	}
	const ageMs = now - current.sampledAt;
	if (ageMs >= lostAfterMs) {
		stored.tier = "normal";
		stored.transition = null;
		stored.reading = null;
		return "lost";
	}
	stored.reading = current;
	if (availability === "failed") {
		stored.transition = null;
		return "stale";
	}
	if (ageMs <= staleAfterMs) return "live";
	stored.transition = null;
	return "stale";
};

const updateSignal = <T>(
	key: MachinePressureSignalKey,
	stored: StoredSignal<T>,
	reading: TimedReading<T> | null,
	score: (value: T) => number,
	now: number,
	availability: SignalAvailability = null,
): MachinePressureSignalState<T> => {
	const policy = MACHINE_PRESSURE_POLICY[key];
	const freshness = freshnessOf(stored, reading, now, policy.staleAfterMs, policy.lostAfterMs, availability);
	if (freshness === "live" && reading !== null) updateTier(stored, score(reading.value), policy, now);
	return { key, tier: stored.tier, freshness, reading: stored.reading };
};

export class MachinePressureMonitor {
	private readonly cpuLoad = initialSignal<number>();
	private readonly memory = initialSignal<MemoryPressureLevel>();
	private readonly thermal = initialSignal<ThermalState>();
	private readonly temperature = initialSignal<number>() as StoredSignal<number> & {
		reading: TemperatureReading | null;
	};

	update(readings: MachinePressureReadings, now: number): MachinePressureState {
		return {
			cpuLoad: updateSignal("cpuLoad", this.cpuLoad, readings.cpuLoad, (value) => value, now),
			memory: updateSignal("memory", this.memory, readings.memory, (value) => value, now),
			thermal: updateSignal("thermal", this.thermal, readings.thermal, thermalScore, now),
			temperature: updateSignal(
				"temperature",
				this.temperature,
				readings.temperature,
				(value) => value,
				now,
				readings.temperatureReader === "available" ? null : readings.temperatureReader,
			) as MachinePressureState["temperature"],
		};
	}
}

export const activeMachinePressureSignals = (state: MachinePressureState) =>
	machinePressureSignalKeys
		.map((key) => state[key])
		.filter(
			(signal) =>
				signal.tier !== "normal" &&
				signal.reading !== null &&
				(signal.freshness === "live" || signal.freshness === "stale"),
		);
