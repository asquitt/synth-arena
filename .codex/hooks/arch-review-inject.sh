#!/bin/bash

if ! command -v python3 >/dev/null 2>&1; then
    exit 0
fi

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | python3 -c '
import json
import sys

try:
    value = json.load(sys.stdin).get("prompt", "")
except (AttributeError, json.JSONDecodeError):
    value = ""
print(value if isinstance(value, str) else "")
' 2>/dev/null || true)

if [ -z "$PROMPT" ]; then
    exit 0
fi

if echo "$PROMPT" | grep -qiE '(implement|add|create|build|fix|refactor|modify|update|review).*(feature|service|agent|task|handler|model|component|module|endpoint|workflow|architecture|codebase)'; then
    cat << 'EOF'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"SYNTHARENA AUTHORITY: Read PROJECT_STATUS.json, AGENTS.md, CLAUDE.md, and docs/INTERNAL_TOOLING_BOUNDARY.md. This is private internal evaluation tooling, not a standalone product. Require a named consumer and versioned contract for extraction; require two independent adopters before shared-platform expansion; preserve provenance, isolation, replay, cost lineage, rollback, and exact-review evidence."}}
EOF
fi

exit 0
