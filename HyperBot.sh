#!/usr/bin/env sh
set -eu

ProjectRoot="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
VenvDirectory="${ProjectRoot}/.hyperbot-cli-venv"

FindPython() {
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi

  if command -v python >/dev/null 2>&1; then
    command -v python
    return
  fi

  echo "Python 3 is required to run HyperBot CLI." >&2
  exit 1
}

PythonCommand="$(FindPython)"

if [ ! -x "${VenvDirectory}/bin/python" ]; then
  echo "Creating the HyperBot CLI virtual environment..."
  "${PythonCommand}" -m venv "${VenvDirectory}"
fi

exec "${VenvDirectory}/bin/python" "${ProjectRoot}/scripts/hyperbot_cli.py" "$@"
