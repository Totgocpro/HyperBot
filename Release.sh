#!/usr/bin/env sh
set -eu

ProjectRoot="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
exec "${ProjectRoot}/HyperBot.sh" start --logs "$@"
