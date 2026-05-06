#!/usr/bin/env bash
# cross-shop installer — symlinks the skill into ~/.claude/skills/ and
# installs Node deps. Idempotent: safe to re-run.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$REPO_DIR/skills/cross-shop"
SKILL_DST="$HOME/.claude/skills/cross-shop"

if [ ! -d "$SKILL_SRC" ]; then
  echo "ERROR: $SKILL_SRC not found. Run install.sh from inside the cloned repo." >&2
  exit 1
fi

mkdir -p "$HOME/.claude/skills"

if [ -L "$SKILL_DST" ]; then
  current="$(readlink "$SKILL_DST")"
  if [ "$current" = "$SKILL_SRC" ]; then
    echo "✓ symlink already points at $SKILL_SRC"
  else
    echo "↻ updating symlink: $SKILL_DST → $SKILL_SRC (was $current)"
    rm "$SKILL_DST"
    ln -s "$SKILL_SRC" "$SKILL_DST"
  fi
elif [ -e "$SKILL_DST" ]; then
  echo "ERROR: $SKILL_DST already exists and is NOT a symlink." >&2
  echo "  Move/back it up, then re-run install.sh." >&2
  exit 1
else
  ln -s "$SKILL_SRC" "$SKILL_DST"
  echo "✓ symlinked $SKILL_DST → $SKILL_SRC"
fi

echo "↻ installing Node deps in $SKILL_SRC ..."
( cd "$SKILL_SRC" && npm ci --silent )
echo "✓ deps installed"

if [ ! -f "$SKILL_SRC/.env" ]; then
  cat <<EOF

NEXT STEPS
  1. (Only the games subcommand works without Phase-1 captures.) Try:
       node $SKILL_SRC/scripts/games.mjs

  2. Follow the capture playbook to unlock the rest:
       open $SKILL_SRC/references/cross-shop.md
     Each captured (game x rail) cell populates a slot in:
       $SKILL_SRC/references/games.json

  3. (Required for login / purchase / orders) create your wallet env file:
       cp $SKILL_SRC/.env.example $SKILL_SRC/.env
       chmod 600 $SKILL_SRC/.env
     Then edit it and set PRIVATE_KEY (and ideally MAX_PURCHASE_NOTIONAL).

  4. Try it from Claude Code:
       "cross.shop 게임 목록"
       "list available games on cross.shop"
       "rohan2 샵에서 살 수 있는 패키지 목록"  (after Phase 1)

  NOTE: purchase.mjs --pay CARD aborts with unsupported_rail_v0_1.
  Hosted-checkout / 3DS is deferred to v0.2.

EOF
else
  echo "✓ $SKILL_SRC/.env already present — skipping setup"
fi
