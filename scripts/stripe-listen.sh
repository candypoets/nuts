#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
	echo "Missing .env" >&2
	exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z ${STRIPE_SECRET_KEY:-} ]]; then
	echo "Missing STRIPE_SECRET_KEY in .env" >&2
	exit 1
fi

if [[ -z ${STRIPE_CONNECT_WEBHOOK_SECRET:-} ]]; then
	echo "Missing STRIPE_CONNECT_WEBHOOK_SECRET in .env" >&2
	exit 1
fi

export STRIPE_API_KEY="$STRIPE_SECRET_KEY"

active_secret=$(stripe listen --skip-update --print-secret)
if [[ $active_secret != "$STRIPE_CONNECT_WEBHOOK_SECRET" ]]; then
	echo "STRIPE_CONNECT_WEBHOOK_SECRET does not match the Stripe CLI listener secret" >&2
	exit 1
fi

webhook_url=http://127.0.0.1:5173/api/stripe/webhook
lan_ip=$(
	ip route get 1.1.1.1 2>/dev/null |
		awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }'
)

server_pid=

terminate_process_tree() {
	local parent_pid=$1
	local child_pid

	while read -r child_pid; do
		if [[ -n $child_pid ]]; then
			terminate_process_tree "$child_pid"
		fi
	done < <(pgrep -P "$parent_pid" 2>/dev/null || true)

	kill "$parent_pid" 2>/dev/null || true
}

cleanup_server() {
	local exit_code=$?

	trap - EXIT INT TERM
	if [[ -n $server_pid ]]; then
		terminate_process_tree "$server_pid"
		wait "$server_pid" 2>/dev/null || true
	fi

	exit "$exit_code"
}

trap cleanup_server EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if curl -fsS --max-time 1 -o /dev/null http://127.0.0.1:5173/; then
	echo "Port 5173 already has a running server; stop it before running npm run dev:stripe." >&2
	exit 1
fi

echo "Starting Nuts dev server (Node logs will appear in this terminal)..."
npm run dev -- --strictPort &
server_pid=$!

server_ready=false
for ((attempt = 0; attempt < 80; attempt++)); do
	if curl -fsS --max-time 1 -o /dev/null http://127.0.0.1:5173/; then
		server_ready=true
		break
	fi

	if ! kill -0 "$server_pid" 2>/dev/null; then
		set +e
		wait "$server_pid"
		server_exit_code=$?
		set -e
		server_pid=
		echo "Nuts dev server exited before it became ready." >&2
		if ((server_exit_code == 0)); then
			server_exit_code=1
		fi
		exit "$server_exit_code"
	fi

	sleep 0.25
done

if [[ $server_ready != true ]]; then
	echo "Warning: Nuts did not become reachable on port 5173 within 20 seconds." >&2
fi

echo "Stripe Connect webhook target: $webhook_url"
if [[ -n $lan_ip ]]; then
	echo "Nuts LAN app URL:            http://$lan_ip:5173"
	echo "Nuts LAN webhook URL:        http://$lan_ip:5173/api/stripe/webhook"
fi

stripe listen \
	--skip-update \
	--events checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid \
	--forward-connect-to "$webhook_url" \
	2>&1 | sed -u -E 's/whsec_[A-Za-z0-9]+/[configured]/g'
