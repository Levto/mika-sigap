#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$PROJECT_DIR/webapp"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
NVM_VERSION="v0.40.3"

if [[ ! -f "$APP_DIR/package.json" || ! -f "$APP_DIR/package-lock.json" ]]; then
  echo "Error: webapp package files were not found in $APP_DIR" >&2
  exit 1
fi

has_supported_node() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1);
  '
}

if ! has_supported_node; then
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    installer="$(mktemp)"
    trap 'rm -f "$installer"' EXIT
    installer_url="https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh"

    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$installer_url" -o "$installer"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$installer" "$installer_url"
    else
      echo "Error: curl or wget is needed to install Node.js without sudo." >&2
      exit 1
    fi

    PROFILE=/dev/null NVM_DIR="$NVM_DIR" bash "$installer"
    rm -f "$installer"
    trap - EXIT
  fi

  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    echo "Error: nvm installation did not create $NVM_DIR/nvm.sh" >&2
    exit 1
  fi
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm install 24
  nvm use 24
fi

if ! has_supported_node; then
  echo "Error: Node.js 22.5 or newer is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm was not found alongside Node.js." >&2
  exit 1
fi

cd "$APP_DIR"
if ! npm ls --omit=dev --depth=0 >/dev/null 2>&1; then
  npm ci
fi

export PORT="${PORT:-3000}"
export HOST="${HOST:-0.0.0.0}"
echo "Starting MIKA SIGAP on ${HOST}:${PORT}; open http://<server-ip>:${PORT} from another device."
exec npm start
