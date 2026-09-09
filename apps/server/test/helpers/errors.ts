// Postgres names the constraint in every violation message, so a test can
// assert that an insert failed on the one constraint it targets.
export const checkNamed = (name: string) => new RegExp(`violates check constraint "${name}"`);
export const UNIQUE = /violates unique constraint/;
export const FOREIGN_KEY = /violates foreign key constraint/;
export const NOT_NULL = /violates not-null constraint/;
