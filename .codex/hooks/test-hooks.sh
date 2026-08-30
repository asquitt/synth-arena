#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
config="$repo_root/.codex/hooks.json"
nested_dir="$repo_root/packages/core/src"

read_config_command() {
  python3 -c "import json; print(json.load(open('$config'))['hooks']['$1'][0]['hooks'][0]['command'])"
}

assert_json() {
  python3 -c "$1"
}

user_prompt_command=$(read_config_command UserPromptSubmit)
prompt_output=$(printf '%s' '{"prompt":"Implement a new endpoint"}' | (cd "$nested_dir" && sh -c "$user_prompt_command"))
printf '%s' "$prompt_output" | assert_json '
import json, sys
value = json.load(sys.stdin)["hookSpecificOutput"]
assert value["hookEventName"] == "UserPromptSubmit"
assert "SYNTHARENA AUTHORITY" in value["additionalContext"]
'

test -z "$(printf '%s' '{"prompt":"hello"}' | (cd "$nested_dir" && sh -c "$user_prompt_command"))"
test -z "$(printf '%s' '{not-json' | (cd "$nested_dir" && sh -c "$user_prompt_command"))"

stop_command=$(read_config_command Stop)
stop_output=$(printf '%s' '{"stop_hook_active":false}' | (cd "$nested_dir" && sh -c "$stop_command"))
printf '%s' "$stop_output" | assert_json '
import json, sys
value = json.load(sys.stdin)
assert value["decision"] == "block"
assert "Never present SynthArena as a standalone product" in value["reason"]
'

test -z "$(printf '%s' '{"stop_hook_active":true}' | (cd "$nested_dir" && sh -c "$stop_command"))"
test -z "$(printf '%s' '{not-json' | (cd "$nested_dir" && sh -c "$stop_command"))"
test -z "$(printf '%s' '{}' | (cd "$nested_dir" && sh -c "$stop_command"))"
test -z "$(printf '%s' '{"prompt":"Implement a new endpoint"}' | PATH=/nonexistent /bin/bash "$repo_root/.codex/hooks/arch-review-inject.sh")"
test -z "$(printf '%s' '{"stop_hook_active":false}' | PATH=/nonexistent /bin/bash "$repo_root/.codex/hooks/stop-quality-prompt.sh")"

echo "Codex hook contract checks passed"
