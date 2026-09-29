#!/bin/sh
set -eu
umask 077
exec /opt/langflow/.venv/bin/langflow "$@"
