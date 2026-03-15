#!/usr/bin/env bash
set -euo pipefail

REPO="dingkwang/opencode-grok-special-edition"
BIN_NAME="opencode-grok"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${VERSION:-latest}"

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

detect_os() {
  case "$(uname -s)" in
    Linux) printf 'linux' ;;
    Darwin) printf 'darwin' ;;
    *)
      fail "unsupported operating system: $(uname -s)"
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'x64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *)
      fail "unsupported architecture: $(uname -m)"
      ;;
  esac
}

supports_avx2() {
  if [ "$ARCH" != "x64" ]; then
    return 1
  fi

  case "$OS" in
    linux)
      grep -qiE '(^|[[:space:]])avx2([[:space:]]|$)' /proc/cpuinfo 2>/dev/null
      ;;
    darwin)
      [ "$(sysctl -n hw.optional.avx2_0 2>/dev/null || printf '0')" = "1" ]
      ;;
    *)
      return 1
      ;;
  esac
}

is_musl() {
  if [ "$OS" != "linux" ]; then
    return 1
  fi

  if [ -f /etc/alpine-release ]; then
    return 0
  fi

  if command -v ldd >/dev/null 2>&1; then
    ldd --version 2>&1 | grep -qi musl
    return $?
  fi

  return 1
}

asset_candidates() {
  local base="opencode-grok-${OS}-${ARCH}"

  if [ "$OS" = "linux" ]; then
    if [ "$ARCH" = "x64" ]; then
      if is_musl; then
        if supports_avx2; then
          printf '%s\n' "${base}-musl"
          printf '%s\n' "${base}-baseline-musl"
          printf '%s\n' "${base}"
          printf '%s\n' "${base}-baseline"
        else
          printf '%s\n' "${base}-baseline-musl"
          printf '%s\n' "${base}-musl"
          printf '%s\n' "${base}-baseline"
          printf '%s\n' "${base}"
        fi
      else
        if supports_avx2; then
          printf '%s\n' "${base}"
          printf '%s\n' "${base}-baseline"
          printf '%s\n' "${base}-musl"
          printf '%s\n' "${base}-baseline-musl"
        else
          printf '%s\n' "${base}-baseline"
          printf '%s\n' "${base}"
          printf '%s\n' "${base}-baseline-musl"
          printf '%s\n' "${base}-musl"
        fi
      fi
      return
    fi

    if is_musl; then
      printf '%s\n' "${base}-musl"
    fi
    printf '%s\n' "${base}"
    return
  fi

  if [ "$ARCH" = "x64" ] && ! supports_avx2; then
    printf '%s\n' "${base}-baseline"
  fi
  printf '%s\n' "${base}"
}

resolve_version() {
  if [ "$VERSION" != "latest" ]; then
    printf '%s\n' "${VERSION#v}"
    return
  fi

  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$tag" ] || fail "could not determine latest release"
  printf '%s\n' "${tag#v}"
}

download_asset() {
  local version="$1"
  local name url

  for name in $(asset_candidates); do
    url="https://github.com/${REPO}/releases/download/v${version}/${name}.tar.gz"
    if curl -fsI -L "$url" >/dev/null 2>&1; then
      curl -fL "$url" -o "${TMP_DIR}/${name}.tar.gz"
      ASSET_NAME="$name"
      return
    fi
  done

  fail "no release artifact found for ${OS}/${ARCH}"
}

need_cmd curl
need_cmd tar
need_cmd mktemp

OS="$(detect_os)"
ARCH="$(detect_arch)"
TMP_DIR="$(mktemp -d)"
ASSET_NAME=""
trap 'rm -rf "$TMP_DIR"' EXIT

RELEASE_VERSION="$(resolve_version)"
download_asset "$RELEASE_VERSION"

mkdir -p "$INSTALL_DIR"
tar -xzf "${TMP_DIR}/${ASSET_NAME}.tar.gz" -C "$TMP_DIR"
install -m 0755 "${TMP_DIR}/${ASSET_NAME}/bin/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"

log "Installed ${BIN_NAME} ${RELEASE_VERSION} to ${INSTALL_DIR}/${BIN_NAME}"
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    log "Add ${INSTALL_DIR} to your PATH to run ${BIN_NAME} directly."
    ;;
esac
