-- Migration 0022 repaired a broken launch template to the default of the day
-- it was written, which named the local machine as `--local`. The default
-- now names the Superset host of the project through the `{{target}}`
-- variable, and a template that still says `--local` runs every agent on the
-- machine that runs the server, whichever host the project picks. This
-- migration moves that template, and the template of anyone who kept the
-- older default, to the current one. A template a person changed in any
-- other way stays as it is.
UPDATE "settings"
SET "value" = to_jsonb($${{superset}} ws create {{target}} --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json$$::text),
	"updated_at" = NOW()
WHERE "key" = 'agentLaunchCommand'
	AND "value" = to_jsonb($${{superset}} ws create --local --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json$$::text);
