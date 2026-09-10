import { closeSync, existsSync, openSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

// One record on the wire: the instant, the level, the message, and the
// fields the caller adds.
export type LogRecord = { ts: string; level: LogLevel; msg: string; [field: string]: unknown };

export type Fields = Record<string, unknown>;

// Where the lines go. `isTTY` decides the format: pretty text on a
// terminal outside production, one JSON line everywhere else.
export type LogSink = { isTTY: boolean; write: (line: string) => void; close?: () => void };

// A sink that holds a file, so it has something to close.
export type FileSink = LogSink & { close: () => void };

export type Logger = {
	level: LogLevel;
	debug: (msg: string, fields?: Fields) => void;
	info: (msg: string, fields?: Fields) => void;
	warn: (msg: string, fields?: Fields) => void;
	error: (msg: string, fields?: Fields) => void;
	close: () => void;
};

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const pretty = (record: LogRecord) => {
	const { ts, level, msg, ...fields } = record;
	const extra = Object.entries(fields)
		.map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
		.join(" ");
	return `${ts} ${level.padEnd(5)} ${msg}${extra.length > 0 ? ` ${extra}` : ""}`;
};

export type LoggerOptions = {
	level: LogLevel;
	sink: LogSink;
	env: Record<string, string | undefined>;
};

// A record below `level` is dropped before it is formatted.
export const createLogger = ({ level, sink, env }: LoggerOptions): Logger => {
	const asText = sink.isTTY && env.NODE_ENV !== "production";
	const write = (recordLevel: LogLevel, msg: string, fields: Fields = {}) => {
		if (RANK[recordLevel] < RANK[level]) return;
		const record: LogRecord = { ts: new Date().toISOString(), level: recordLevel, msg, ...fields };
		sink.write(`${asText ? pretty(record) : JSON.stringify(record)}\n`);
	};
	return {
		level,
		debug: (msg, fields) => write("debug", msg, fields),
		info: (msg, fields) => write("info", msg, fields),
		warn: (msg, fields) => write("warn", msg, fields),
		error: (msg, fields) => write("error", msg, fields),
		close: () => sink.close?.(),
	};
};

// Writes every line to `process.stdout`.
export const stdoutSink = (): LogSink => ({
	isTTY: process.stdout.isTTY === true,
	write: (line) => {
		process.stdout.write(line);
	},
});

// One sink that writes to several.
export const teeSink = (sinks: LogSink[]): LogSink => ({
	isTTY: sinks.every((sink) => sink.isTTY),
	write: (line) => {
		for (const sink of sinks) sink.write(line);
	},
	close: () => {
		for (const sink of sinks) sink.close?.();
	},
});

export type RotatingSinkOptions = { path: string; maxBytes: number; maxFiles: number };

// A file that rotates when a write would take it past `maxBytes`:
// `<path>` becomes `<path>.1`, `<path>.1` becomes `<path>.2`, and so on,
// and `<path>.<maxFiles>` is removed. The disk therefore never holds more
// than `maxBytes * (maxFiles + 1)` of logs. Writes are synchronous, so the
// last line before a crash is on disk.
export const createRotatingSink = ({ path, maxBytes, maxFiles }: RotatingSinkOptions): FileSink => {
	let fd = openSync(path, "a");
	let size = statSync(path).size;

	const rotate = () => {
		closeSync(fd);
		const oldest = `${path}.${maxFiles}`;
		if (existsSync(oldest)) unlinkSync(oldest);
		for (let n = maxFiles - 1; n >= 1; n -= 1) {
			if (existsSync(`${path}.${n}`)) renameSync(`${path}.${n}`, `${path}.${n + 1}`);
		}
		renameSync(path, `${path}.1`);
		fd = openSync(path, "a");
		size = 0;
	};

	return {
		isTTY: false,
		write: (line) => {
			const bytes = Buffer.byteLength(line);
			if (size > 0 && size + bytes > maxBytes) rotate();
			writeSync(fd, line);
			size += bytes;
		},
		close: () => closeSync(fd),
	};
};
