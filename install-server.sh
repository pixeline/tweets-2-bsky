#!/usr/bin/env bash

set -euo pipefail

APP_NAME="tweets-2-bsky"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"
APP_PORT=""
TS_HTTPS_PORT=""
TS_AUTHKEY=""
TS_HOSTNAME=""
USE_FUNNEL=0
INSTALL_ARGS=()

usage() {
  cat <<'USAGE'
Usage: ./install-server.sh [options]

Secure Linux VPS install for Tailscale-first access:
  - Runs regular app installer
  - Forces app bind to localhost only (HOST=127.0.0.1)
  - Installs and starts Tailscale if needed
  - Publishes app through Tailscale Serve (HTTPS on tailnet)

Options:
  --port <number>        App port (default: 3000; auto-adjusts if already in use)
  --https-port <number>  Tailscale HTTPS serve port (auto-select if omitted)
  --auth-key <key>       Tailscale auth key for non-interactive login
  --hostname <name>      Optional Tailscale device hostname
  --funnel               Also enable Tailscale Funnel (public internet)

Install passthrough options (forwarded to ./install.sh):
  --no-start
  --start-only
  --pm2
  --nohup
  --skip-install
  --skip-build

  -h, --help             Show this help
USAGE
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name"
    exit 1
  fi
}

is_valid_port() {
  local candidate="$1"
  [[ "$candidate" =~ ^[0-9]+$ ]] || return 1
  (( candidate >= 1 && candidate <= 65535 ))
}

is_local_port_free() {
  local port="$1"
  node -e '
const net = require("node:net");
const port = Number(process.argv[1]);
const server = net.createServer();
server.once("error", () => process.exit(1));
server.once("listening", () => server.close(() => process.exit(0)));
server.listen(port, "127.0.0.1");
' "$port" >/dev/null 2>&1
}

find_next_free_local_port() {
  local start_port="$1"
  local port
  for port in $(seq "$start_port" 65535); do
    if is_local_port_free "$port"; then
      printf '%s\n' "$port"
      return 0
    fi
  done
  return 1
}

ensure_linux() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "install-server.sh currently supports Linux only."
    echo "Use ./install.sh on macOS or other environments."
    exit 1
  fi
}

ensure_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is required to install and configure Tailscale on this host."
    exit 1
  fi
}

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
    return
  fi
  sudo "$@"
}

get_env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi
  printf '%s\n' "${line#*=}"
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  touch "$ENV_FILE"
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    $0 ~ ("^" key "=") {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$ENV_FILE" > "$tmp_file"
  mv "$tmp_file" "$ENV_FILE"
}

ensure_local_only_env() {
  local configured_port
  configured_port="$(get_env_value PORT)"
  if [[ -n "$configured_port" && -z "${APP_PORT:-}" ]]; then
    APP_PORT="$configured_port"
  fi
  if [[ -z "${APP_PORT:-}" ]]; then
    APP_PORT="3000"
  fi

  if ! is_valid_port "$APP_PORT"; then
    echo "Invalid port: $APP_PORT"
    exit 1
  fi

  if ! is_local_port_free "$APP_PORT"; then
    local requested_port="$APP_PORT"
    APP_PORT="$(find_next_free_local_port "$APP_PORT" || true)"
    if [[ -z "$APP_PORT" ]]; then
      echo "Could not find a free local port for the app."
      exit 1
    fi
    echo "⚠️  App port ${requested_port} is already in use. Using ${APP_PORT} instead."
  fi

  upsert_env_value PORT "$APP_PORT"
  upsert_env_value HOST "127.0.0.1"
}

run_app_install() {
  local install_cmd=(bash "$SCRIPT_DIR/install.sh" --port "$APP_PORT")
  install_cmd+=("${INSTALL_ARGS[@]}")
  "${install_cmd[@]}"
}

install_tailscale_if_needed() {
  if command -v tailscale >/dev/null 2>&1; then
    echo "✅ Tailscale already installed."
    return
  fi

  echo "📦 Installing Tailscale..."
  if command -v curl >/dev/null 2>&1; then
    run_as_root bash -c 'curl -fsSL https://tailscale.com/install.sh | sh'
  elif command -v wget >/dev/null 2>&1; then
    run_as_root bash -c 'wget -qO- https://tailscale.com/install.sh | sh'
  else
    echo "Need curl or wget to install Tailscale automatically."
    exit 1
  fi

  if ! command -v tailscale >/dev/null 2>&1; then
    echo "Tailscale installation did not complete successfully."
    exit 1
  fi
}

ensure_tailscaled_running() {
  echo "🔧 Ensuring tailscaled is running..."
  if command -v systemctl >/dev/null 2>&1; then
    run_as_root systemctl enable --now tailscaled
    return
  fi

  if command -v rc-service >/dev/null 2>&1; then
    run_as_root rc-service tailscaled start || true
    if command -v rc-update >/dev/null 2>&1; then
      run_as_root rc-update add tailscaled default || true
    fi
    return
  fi

  if command -v service >/dev/null 2>&1; then
    run_as_root service tailscaled start || true
    return
  fi

  echo "Could not detect init system to start tailscaled automatically."
  echo "Please start tailscaled manually, then re-run this script."
  exit 1
}

ensure_tailscale_connected() {
  if run_as_root tailscale ip -4 >/dev/null 2>&1; then
    echo "✅ Tailscale is already connected."
    return
  fi

  echo "🔐 Connecting this host to Tailscale..."
  local up_cmd=(tailscale up)

  if [[ -n "$TS_AUTHKEY" ]]; then
    up_cmd+=(--authkey "$TS_AUTHKEY")
  fi

  if [[ -n "$TS_HOSTNAME" ]]; then
    up_cmd+=(--hostname "$TS_HOSTNAME")
  fi

  if ! run_as_root "${up_cmd[@]}"; then
    echo "Failed to connect to Tailscale."
    if [[ -z "$TS_AUTHKEY" ]]; then
      echo "Tip: provide --auth-key for non-interactive server setup."
    fi
    exit 1
  fi
}

get_used_tailscale_https_ports() {
  local json
  json="$(run_as_root tailscale serve status --json 2>/dev/null || true)"
  if [[ -z "$json" || "$json" == "{}" ]]; then
    return 0
  fi

  printf '%s' "$json" | node -e '
const fs = require("node:fs");
try {
  const data = JSON.parse(fs.readFileSync(0, "utf8"));
  const sets = [data?.Web, data?.web, data?.TCP, data?.tcp];
  const used = new Set();
  for (const obj of sets) {
    if (!obj || typeof obj !== "object") continue;
    for (const key of Object.keys(obj)) {
      if (/^\d+$/.test(key)) used.add(Number(key));
    }
  }
  process.stdout.write([...used].sort((a, b) => a - b).join("\n"));
} catch {}
'
}

pick_tailscale_https_port() {
  local preferred="$1"
  local allow_used_preferred="${2:-0}"
  local used_ports
  used_ports="$(get_used_tailscale_https_ports || true)"

  local is_used=0
  if [[ -n "$preferred" ]]; then
    if ! is_valid_port "$preferred"; then
      echo "Invalid Tailscale HTTPS port: $preferred"
      exit 1
    fi
    if [[ -z "$used_ports" ]] || ! grep -qx "$preferred" <<<"$used_ports"; then
      printf '%s\n' "$preferred"
      return 0
    fi
    if [[ "$allow_used_preferred" -eq 1 ]]; then
      printf '%s\n' "$preferred"
      return 0
    fi
    is_used=1
  fi

  local candidate
  for candidate in 443 8443 9443; do
    if [[ -z "$used_ports" ]] || ! grep -qx "$candidate" <<<"$used_ports"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  for candidate in $(seq 10000 65535); do
    if [[ -z "$used_ports" ]] || ! grep -qx "$candidate" <<<"$used_ports"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if [[ "$is_used" -eq 1 ]]; then
    echo "No free Tailscale HTTPS serve port available (preferred port is already used)."
  else
    echo "No free Tailscale HTTPS serve port available."
  fi
  exit 1
}

configure_tailscale_serve() {
  local preferred_https_port="$TS_HTTPS_PORT"
  local preferred_from_saved=0
  local saved_https_port
  saved_https_port="$(get_env_value TAILSCALE_HTTPS_PORT)"
  if [[ -z "$preferred_https_port" && -n "$saved_https_port" ]]; then
    preferred_https_port="$saved_https_port"
    preferred_from_saved=1
  fi

  TS_HTTPS_PORT="$(pick_tailscale_https_port "$preferred_https_port" "$preferred_from_saved")"
  upsert_env_value TAILSCALE_HTTPS_PORT "$TS_HTTPS_PORT"

  if [[ -n "$preferred_https_port" && "$preferred_https_port" != "$TS_HTTPS_PORT" ]]; then
    echo "⚠️  Tailscale HTTPS port ${preferred_https_port} is already used. Using ${TS_HTTPS_PORT}."
  fi

  echo "🌐 Configuring Tailscale Serve (HTTPS ${TS_HTTPS_PORT} -> localhost:${APP_PORT})..."
  if ! run_as_root tailscale serve --https "$TS_HTTPS_PORT" --bg --yes "http://127.0.0.1:${APP_PORT}"; then
    run_as_root tailscale serve --https "$TS_HTTPS_PORT" --bg "http://127.0.0.1:${APP_PORT}"
  fi

  if [[ "$USE_FUNNEL" -eq 1 ]]; then
    echo "⚠️  Enabling Tailscale Funnel (public internet exposure)..."
    if ! run_as_root tailscale funnel --https "$TS_HTTPS_PORT" --bg --yes "http://127.0.0.1:${APP_PORT}"; then
      run_as_root tailscale funnel --https "$TS_HTTPS_PORT" --bg "http://127.0.0.1:${APP_PORT}"
    fi
  fi
}

get_tailscale_dns_name() {
  local json
  json="$(run_as_root tailscale status --json 2>/dev/null || true)"
  if [[ -z "$json" ]]; then
    return 0
  fi

  printf '%s' "$json" | node -e '
const fs = require("node:fs");
try {
  const data = JSON.parse(fs.readFileSync(0, "utf8"));
  const dnsName = typeof data?.Self?.DNSName === "string" ? data.Self.DNSName : "";
  process.stdout.write(dnsName.replace(/\.$/, ""));
} catch {}
'
}

get_tailscale_ipv4() {
  run_as_root tailscale ip -4 2>/dev/null | head -n 1 || true
}

print_summary() {
  local dns_name
  dns_name="$(get_tailscale_dns_name)"
  local ts_ip
  ts_ip="$(get_tailscale_ipv4)"
  local final_url=""
  local port_suffix=""
  if [[ "$TS_HTTPS_PORT" != "443" ]]; then
    port_suffix=":${TS_HTTPS_PORT}"
  fi
  if [[ -n "$dns_name" ]]; then
    final_url="https://${dns_name}${port_suffix}"
  elif [[ -n "$ts_ip" ]]; then
    final_url="https://${ts_ip}${port_suffix}"
  fi

  echo ""
  echo "Setup complete for Linux server mode."
  echo ""
  echo "App binding:"
  echo "  HOST=127.0.0.1 (local-only)"
  echo "  PORT=${APP_PORT}"
  echo ""
  echo "Local checks on server:"
  echo "  http://127.0.0.1:${APP_PORT}"
  echo ""
  echo "Tailnet access:"
  if [[ -n "$final_url" ]]; then
    echo "  ${final_url}"
    echo ""
    echo "✅ It will be accessible on ${final_url} wherever that person is authenticated on Tailscale."
  else
    echo "  Run: sudo tailscale status"
  fi

  if [[ "$USE_FUNNEL" -eq 1 ]]; then
    echo ""
    echo "Public access is enabled via Funnel."
  else
    echo ""
    echo "Public internet exposure is disabled."
  fi

  echo ""
  echo "Useful commands:"
  echo "  ./install.sh --status"
  echo "  sudo tailscale serve status"
  if [[ "$USE_FUNNEL" -eq 1 ]]; then
    echo "  sudo tailscale funnel status"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --port"
        exit 1
      fi
      APP_PORT="$2"
      shift
      ;;
    --https-port)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --https-port"
        exit 1
      fi
      TS_HTTPS_PORT="$2"
      shift
      ;;
    --auth-key)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --auth-key"
        exit 1
      fi
      TS_AUTHKEY="$2"
      shift
      ;;
    --hostname)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --hostname"
        exit 1
      fi
      TS_HOSTNAME="$2"
      shift
      ;;
    --funnel)
      USE_FUNNEL=1
      ;;
    --pm2|--nohup|--skip-install|--skip-build|--no-start|--start-only)
      INSTALL_ARGS+=("$1")
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

ensure_linux
ensure_sudo
require_command bash
require_command node
require_command npm
require_command git

ensure_local_only_env
run_app_install
install_tailscale_if_needed
ensure_tailscaled_running
ensure_tailscale_connected
configure_tailscale_serve
print_summary
