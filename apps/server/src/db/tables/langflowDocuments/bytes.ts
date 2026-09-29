import { customType } from "drizzle-orm/pg-core";

export const bytes = customType<{ data: Buffer; driverData: Uint8Array }>({
	dataType: () => "bytea",
	toDriver: (value) => value,
	fromDriver: (value) => Buffer.from(value),
});
