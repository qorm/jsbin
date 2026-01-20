#!/usr/bin/env bash
set -euo pipefail

# Cross-platform binary runner
#
# Automatically detects platform from filename and runs appropriately:
#   - macOS binaries: direct execution
#   - Linux binaries: Docker container
#   - Windows binaries: Wine
#
# Usage:
#   ./run.sh <binary> [args...]
#   ./run.sh hello-macos-arm64           # Direct execution
#   ./run.sh hello-linux-x64             # Docker
#   ./run.sh hello-windows-x64.exe       # Wine
#
# Env (optional):
#   TARGET_ARCH=amd64|arm64
#   DOCKER_IMAGE_LINUX_AMD64=<image>
#   DOCKER_IMAGE_LINUX_ARM64=<image>
#   WINE_CMD=wine|wine64                 (auto-detected)

lc() { tr '[:upper:]' '[:lower:]'; }

# Detect platform and architecture from binary name
detect_platform() {
  local bin_base
  bin_base="$(basename "$1" | lc)"
  
  if [[ "$bin_base" == *macos* ]] || [[ "$bin_base" == *darwin* ]]; then
    echo "macos"
  elif [[ "$bin_base" == *linux* ]]; then
    echo "linux"
  elif [[ "$bin_base" == *windows* ]] || [[ "$bin_base" == *win* ]] || [[ "$bin_base" == *.exe ]]; then
    echo "windows"
  else
    # Default to current host
    case "$(uname -s | lc)" in
      darwin) echo "macos" ;;
      linux) echo "linux" ;;
      *) echo "linux" ;;
    esac
  fi
}

detect_arch() {
  local bin_base
  bin_base="$(basename "$1" | lc)"
  
  if [[ "${TARGET_ARCH:-}" != "" ]]; then
    printf '%s' "${TARGET_ARCH}" | lc
    return 0
  fi
  
  if [[ "$bin_base" == *arm64* ]] || [[ "$bin_base" == *aarch64* ]]; then
    echo "arm64"
    return 0
  fi
  
  if [[ "$bin_base" == *amd64* ]] || [[ "$bin_base" == *x86_64* ]] || [[ "$bin_base" == *x64* ]]; then
    echo "amd64"
    return 0
  fi
  
  # Default based on host
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64) echo "amd64" ;;
    *) echo "amd64" ;;
  esac
}

# Docker helpers
image_exists_locally() {
  docker image inspect "$1" >/dev/null 2>&1
}

ensure_linux_image() {
  local arch="$1"
  local platform="linux/${arch}"
  local prefix="${LOCAL_IMAGE_PREFIX:-jsbin-runner}"
  local source_image="${FALLBACK_LINUX_SOURCE_IMAGE:-ubuntu:22.04}"
  local fallback_image="${prefix}-linux-${arch}:ubuntu22.04"
  
  # Check env override
  case "$arch" in
    amd64) [[ "${DOCKER_IMAGE_LINUX_AMD64:-}" != "" ]] && { echo "${DOCKER_IMAGE_LINUX_AMD64}"; return 0; } ;;
    arm64) [[ "${DOCKER_IMAGE_LINUX_ARM64:-}" != "" ]] && { echo "${DOCKER_IMAGE_LINUX_ARM64}"; return 0; } ;;
  esac
  
  # Check local image
  if image_exists_locally "$fallback_image"; then
    echo "$fallback_image"
    return 0
  fi
  
  # Pull and tag
  echo "Pulling fallback image: docker pull --platform ${platform} ${source_image}" >&2
  docker pull --platform "$platform" "$source_image" >/dev/null
  docker tag "$source_image" "$fallback_image"
  echo "Tagged: ${fallback_image}" >&2
  echo "$fallback_image"
}

run_linux_docker() {
  local bin_rel="$1"
  shift
  local arch="$1"
  shift
  
  local platform="linux/${arch}"
  local image
  image="$(ensure_linux_image "$arch")"
  
  echo "Docker: image=${image} platform=${platform}" >&2
  
  docker run --rm \
    --platform "$platform" \
    -v "$(pwd)":/app \
    -w /app \
    -e LD_LIBRARY_PATH=/app \
    "$image" \
    sh -c 'chmod +x "/app/$1" 2>/dev/null || true; "/app/$1"; shift; ec=$?; exit $ec' \
    sh "$bin_rel" "$@"
}

run_windows_wine() {
  local bin_rel="$1"
  shift
  local arch="$1"
  shift
  
  # Check if wine is available
  local wine_cmd="${WINE_CMD:-}"
  if [[ "$wine_cmd" == "" ]]; then
    if [[ "$arch" == "amd64" ]] && command -v wine64 >/dev/null 2>&1; then
      wine_cmd="wine64"
    elif command -v wine >/dev/null 2>&1; then
      wine_cmd="wine"
    else
      echo "Error: Wine not found. Install wine to run Windows binaries." >&2
      echo "  macOS: brew install wine-stable" >&2
      echo "  Linux: apt install wine" >&2
      exit 1
    fi
  fi
  
  echo "Wine: ${wine_cmd}" >&2
  
  # Use script to provide a pseudo-tty for Wine (fixes piped output)
  # Wine console programs may not output properly without a tty
  if [[ -t 1 ]]; then
    # stdout is a terminal, run directly
    WINEDEBUG="${WINEDEBUG:--all}" "$wine_cmd" "./$bin_rel" "$@"
  else
    # stdout is piped, use script to simulate tty
    local tmp_out
    tmp_out=$(mktemp)
    # macOS script syntax: script -q output_file command
    if [[ "$(uname -s)" == "Darwin" ]]; then
      WINEDEBUG="${WINEDEBUG:--all}" script -q "$tmp_out" "$wine_cmd" "./$bin_rel" "$@" >/dev/null 2>&1
    else
      # Linux script syntax: script -q -c "command" output_file
      WINEDEBUG="${WINEDEBUG:--all}" script -q -c "$wine_cmd ./$bin_rel $*" "$tmp_out" >/dev/null 2>&1
    fi
    # Clean up: remove carriage returns and all ANSI escape sequences
    cat "$tmp_out" | tr -d '\r' | perl -pe 's/\e\[[0-9;?]*[a-zA-Z]//g' 2>/dev/null || cat "$tmp_out" | tr -d '\r'
    rm -f "$tmp_out"
  fi
}

run_macos_direct() {
  local bin_rel="$1"
  shift
  local arch="$1"
  shift
  
  local host_os host_arch
  host_os="$(uname -s | lc)"
  host_arch="$(uname -m)"
  
  # Normalize host arch
  case "$host_arch" in
    x86_64|amd64) host_arch="amd64" ;;
    arm64|aarch64) host_arch="arm64" ;;
  esac
  
  if [[ "$host_os" != "darwin" ]]; then
    echo "Error: Cannot run macOS binary on ${host_os}" >&2
    exit 1
  fi
  
  # Check architecture compatibility
  if [[ "$arch" != "$host_arch" ]]; then
    # Rosetta 2 can run x64 on arm64
    if [[ "$host_arch" == "arm64" ]] && [[ "$arch" == "amd64" ]]; then
      echo "Running x64 binary via Rosetta 2" >&2
    else
      echo "Error: Cannot run ${arch} binary on ${host_arch}" >&2
      exit 1
    fi
  fi
  
  chmod +x "$bin_rel" 2>/dev/null || true
  "./$bin_rel" "$@"
}

# Help
if [[ ${1:-} == "" || ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  cat >&2 <<EOF
Usage: $0 <binary> [args...]

Cross-platform binary runner. Detects platform from filename:
  - *macos*, *darwin*     → Direct execution
  - *linux*               → Docker container
  - *windows*, *win*, .exe → Wine

Examples:
  $0 hello-macos-arm64
  $0 hello-linux-x64
  $0 hello-windows-x64.exe

Environment:
  DOCKER_IMAGE_LINUX_AMD64  Docker image for x64 Linux
  DOCKER_IMAGE_LINUX_ARM64  Docker image for ARM64 Linux
  WINE_CMD                  Wine command (wine/wine64)
EOF
  exit 2
fi

# Parse binary path
BIN_INPUT="$1"
shift || true

BIN_REL="${BIN_INPUT#./}"
[[ "$BIN_REL" == /* ]] && { echo "Error: use relative path: $BIN_INPUT" >&2; exit 2; }
[[ ! -e "$BIN_REL" ]] && { echo "Error: file not found: $BIN_REL" >&2; exit 2; }

# Detect platform and architecture
PLATFORM="$(detect_platform "$BIN_REL")"
ARCH="$(detect_arch "$BIN_REL")"

echo "Target: platform=${PLATFORM} arch=${ARCH}" >&2

case "$PLATFORM" in
  macos)
    run_macos_direct "$BIN_REL" "$ARCH" "$@"
    ;;
  linux)
    run_linux_docker "$BIN_REL" "$ARCH" "$@"
    ;;
  windows)
    run_windows_wine "$BIN_REL" "$ARCH" "$@"
    ;;
  *)
    echo "Error: unknown platform: $PLATFORM" >&2
    exit 1
    ;;
esac
