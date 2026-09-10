// Postgres names the constraint in every violation message, so a test can
// assert that an insert failed on the one constraint it targets.
export const checkNamed = (name: string) => new RegExp(`violates check constraint "${name}"`);
export const UNIQUE = /violates unique constraint/;
export const FOREIGN_KEY = /violates foreign key constraint/;
// A delete that a RESTRICT foreign key refuses names the setting.
export const RESTRICT = /violates RESTRICT setting of foreign key constraint/;
export const NOT_NULL = /violates not-null constraint/;

// The error a service throws carries the contract code and its data payload.
// The helper returns that error, so a test reads `code` and `data` from it.
export type ContractError = { code: string; message: string; data: unknown };

export const caught = async (run: Promise<unknown>): Promise<ContractError> => {
	try {
		await run;
	} catch (error) {
		return error as ContractError;
	}
	throw new Error("the call resolved, but the test expects a thrown error");
};
