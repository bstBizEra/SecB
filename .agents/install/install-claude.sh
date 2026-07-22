#!/usr/bin/env bash
set -euo pipefail
TARGET=${1:?target repository required}
SRC="$(cd "$(dirname "$0")/.." && pwd)/skills"
DEST="$TARGET/.claude/skills"
mkdir -p "$DEST"
for d in "$SRC"/*; do
  name=$(basename "$d")
  [ ! -e "$DEST/$name" ] || { echo "Refusing to overwrite $DEST/$name" >&2; exit 1; }
  cp -R "$d" "$DEST/$name"
done
echo "Installed SecB architecture skills to $DEST"
