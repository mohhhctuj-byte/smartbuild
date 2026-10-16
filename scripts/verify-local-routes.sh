#!/usr/bin/env bash
set -euo pipefail
base_url="${VEYRA_BASE_URL:-http://127.0.0.1:3000}"
cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar"' EXIT

curl -fsS -c "$cookie_jar" -b "$cookie_jar" -X POST "$base_url/api/personal/bootstrap" -H 'content-type: application/json' -d '{}' >/dev/null
status=$(curl -sS -o /tmp/veyra-route-unbind.json -w '%{http_code}' -c "$cookie_jar" -b "$cookie_jar" -X POST "$base_url/api/local/folder" -H 'content-type: application/json' -d '{"root":""}')
test "$status" = "409"
project_json=$(curl -fsS -c "$cookie_jar" -b "$cookie_jar" -X POST "$base_url/api/workspace/projects" -H 'content-type: application/json' -d '{"name":"HTTP verification"}')
project_id=$(printf '%s' "$project_json" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
conversation_json=$(curl -fsS -c "$cookie_jar" -b "$cookie_jar" -X POST "$base_url/api/workspace/projects/$project_id/conversations" -H 'content-type: application/json' -d '{"title":"Route verification"}')
conversation_id=$(printf '%s' "$conversation_json" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
status=$(curl -sS -o /tmp/veyra-route-checkpoint-before.json -w '%{http_code}' -c "$cookie_jar" -b "$cookie_jar" -X POST "$base_url/api/local/checkpoint" -H 'content-type: application/json' -d "{\"projectId\":$project_id,\"conversationId\":$conversation_id,\"evidence\":\"before plan\"}")
test "$status" = "409"
curl -fsS -c "$cookie_jar" -b "$cookie_jar" -X POST "$base_url/api/ai/plan" -H 'content-type: application/json' -d "{\"projectId\":$project_id,\"conversationId\":$conversation_id,\"goal\":\"Verify route checkpoint\"}" >/dev/null
status=$(curl -sS -o /tmp/veyra-route-checkpoint-after.json -w '%{http_code}' -c "$cookie_jar" -b "$cookie_jar" -X POST "$base_url/api/local/checkpoint" -H 'content-type: application/json' -d "{\"projectId\":$project_id,\"conversationId\":$conversation_id,\"evidence\":\"after plan\"}")
test "$status" = "201"
grep -q 'checkpoint.saved' /tmp/veyra-route-checkpoint-after.json
printf 'local route verification passed\n'
