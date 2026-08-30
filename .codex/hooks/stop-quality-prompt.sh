#!/bin/bash

if ! command -v python3 >/dev/null 2>&1; then
    exit 0
fi

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(printf '%s' "$INPUT" | python3 -c '
import json
import sys

try:
    value = json.load(sys.stdin).get("stop_hook_active")
except (AttributeError, json.JSONDecodeError):
    sys.exit(1)
if value is True:
    print("true")
elif value is False:
    print("false")
else:
    sys.exit(1)
' 2>/dev/null) || exit 0

if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
    exit 0
fi

cat << 'EOF'
{"decision":"block","reason":"Before completing: preserve unrelated work; run the portfolio-status verifier and focused changed-boundary gates; prove any claimed producer, consumer, provenance, isolation, replay, cost, rollback, and cleanup property; require exact base/head/merge-candidate review for material changes; label unavailable runtime, deployment, provider, and customer evidence. Never present SynthArena as a standalone product or call an unmerged candidate shipped."}
EOF

exit 0
