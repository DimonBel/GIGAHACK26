#!/usr/bin/env bash
# Starts MailHog and n8n, imports the Secure MOM delivery workflow and publishes it.
# Safe to re-run: .env and n8n_data are kept, the credentials and the workflow are re-imported.
set -euo pipefail

cd "$(dirname "$0")"

readonly ENV_FILE=.env
readonly OWNER_EMAIL=admin@secure-mom.local
readonly MAILHOG_LOGIN=secure-mom
readonly WORKFLOW_ID=secureMomDeliver
readonly TOKEN_CREDENTIAL_ID=secureMomToken01
readonly TOKEN_HEADER=X-Secure-MOM-Token
readonly N8N_URL=http://127.0.0.1:5678
readonly WEBHOOK_URL=$N8N_URL/webhook/secure-mom
readonly MAILHOG_URL=http://127.0.0.1:8025
readonly WAIT_TIMEOUT_S=180
readonly WEBHOOK_RETRIES=30
readonly BCRYPT_ROUNDS=10
readonly BCRYPTJS=/usr/local/lib/node_modules/n8n/node_modules/bcryptjs

owner_password="" # shown once at the end, never stored
new_mailhog_login=""

die() { echo "setup.sh: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

# Prints the value of $1 in .env without quotes (empty if unset).
env_value() {
  sed -n "s/^$1=['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}\$/\1/p" "$ENV_FILE" | tail -n 1
}

# Sets $1=$2 in .env (no $2: removes $1), replacing any previous line for $1; the file stays private (0600).
set_env() {
  local tmp
  tmp=$(mktemp "$ENV_FILE.XXXXXX")
  grep -v "^$1=" "$ENV_FILE" >"$tmp" || true
  if [ $# -gt 1 ]; then
    printf '%s=%s\n' "$1" "$2" >>"$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
}

n8n_image() {
  sed -n 's/^[[:space:]]*image:[[:space:]]*\(n8nio\/n8n[@:][^[:space:]]*\).*/\1/p' docker-compose.yml
}

# Hashes stdin with the bcryptjs bundled in the n8n image: n8n and MailHog want passwords as bcrypt hashes.
bcrypt_hash() {
  docker run --rm -i --entrypoint node "$(n8n_image)" \
    -e "process.stdout.write(require('$BCRYPTJS').hashSync(require('fs').readFileSync(0, 'utf8'), $BCRYPT_ROUNDS))"
}

# Sets $1 to the bcrypt hash of $2, single-quoted so Docker Compose leaves its $ signs alone.
set_hash() {
  local hash
  hash=$(printf '%s' "$2" | bcrypt_hash)
  [ -n "$hash" ] || die "could not hash the password for $1"
  set_env "$1" "'$hash'"
}

create_secrets() {
  if [ ! -f "$ENV_FILE" ]; then
    (umask 077 && cat >"$ENV_FILE" <<EOF
# Secure MOM delivery secrets, created by setup.sh. Never commit this file.
# SECURE_MOM_N8N_TOKEN: the backend sends it as the X-Secure-MOM-Token header, n8n checks it (a credential).
# N8N_OWNER_*: the n8n editor login; its password is not kept (setup.sh shows it once).
# MAILHOG_*: the login of the MailHog inbox and API.
# Empty a token or *_PASSWORD_HASH and re-run setup.sh for a new one.
EOF
    )
    echo "Created $PWD/$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  if [ -z "$(env_value SECURE_MOM_N8N_TOKEN)" ]; then
    set_env SECURE_MOM_N8N_TOKEN "$(openssl rand -hex 32)"
  fi
  if [ -z "$(env_value N8N_OWNER_EMAIL)" ]; then
    set_env N8N_OWNER_EMAIL "$OWNER_EMAIL"
  fi
  if [ -z "$(env_value N8N_OWNER_PASSWORD_HASH)" ]; then
    owner_password=$(openssl rand -hex 16)
    set_hash N8N_OWNER_PASSWORD_HASH "$owner_password"
    trap show_owner_password EXIT  # shown even if a later step fails: only its hash is stored
  else
    owner_password=$(env_value N8N_OWNER_PASSWORD) # an older setup kept it in plain text: shown once more
    trap show_owner_password EXIT
  fi
  set_env N8N_OWNER_PASSWORD
  if [ -z "$(env_value MAILHOG_USER)" ]; then
    set_env MAILHOG_USER "$MAILHOG_LOGIN"
  fi
  if [ -z "$(env_value MAILHOG_PASSWORD_HASH)" ]; then
    local password
    password=$(openssl rand -hex 16)
    set_env MAILHOG_PASSWORD "$password"
    set_hash MAILHOG_PASSWORD_HASH "$password"
    new_mailhog_login=1
  fi
}

start_and_wait() {
  docker compose up -d --wait --wait-timeout "$WAIT_TIMEOUT_S"
}

n8n_cli() {
  docker compose exec -T n8n n8n "$@"
}

# The webhook's Header Auth credential holds the token; it goes in on stdin, never on a command line.
import_token_credential() {
  local token
  token=$(env_value SECURE_MOM_N8N_TOKEN)
  [[ $token =~ ^[A-Za-z0-9._~-]+$ ]] || die "SECURE_MOM_N8N_TOKEN may only contain letters, digits and . _ ~ -"
  printf '[{"id": "%s", "name": "Secure MOM token", "type": "httpHeaderAuth", "data": {"name": "%s", "value": "%s"}}]' \
    "$TOKEN_CREDENTIAL_ID" "$TOKEN_HEADER" "$token" | n8n_cli import:credentials --input=/dev/stdin
}

# The webhook refuses a call without the token (403); a 404 would mean the workflow is not active.
check_webhook() {
  local status
  for _ in $(seq "$WEBHOOK_RETRIES"); do
    status=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$WEBHOOK_URL" || true)
    [ "$status" = 403 ] && return 0
    sleep 1
  done
  die "the webhook answered $status instead of 403; see: docker compose -f automation/docker-compose.yml logs n8n"
}

# MailHog's inbox and API answer only with the login (the password goes to curl on stdin, not in its arguments).
check_mailhog() {
  local url=$MAILHOG_URL/api/v2/messages?limit=1 anonymous signed_in
  anonymous=$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)
  signed_in=$(printf 'user = "%s:%s"\n' "$(env_value MAILHOG_USER)" "$(env_value MAILHOG_PASSWORD)" |
    curl -s -o /dev/null -w '%{http_code}' -K - "$url" || true)
  [ "$anonymous" = 401 ] && [ "$signed_in" = 200 ] ||
    die "MailHog answered $anonymous without its login and $signed_in with it (expected 401 and 200)"
}

main() {
  need docker
  need openssl
  need curl
  docker info >/dev/null 2>&1 || die "the Docker daemon is not running (on macOS: open -a Docker)"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required"

  create_secrets
  # n8n's database holds the editor login and, for a week, the failed runs with their minutes.
  mkdir -p n8n_data
  if [ -O n8n_data ]; then
    chmod 700 n8n_data
  fi

  step "Starting MailHog and n8n"
  if [ -n "$new_mailhog_login" ]; then
    docker compose up -d --no-deps --force-recreate mailhog # MailHog reads its login when it is created
  fi
  start_and_wait

  step "Importing the credentials and the workflow"
  n8n_cli import:credentials --input=/import/credentials.json
  import_token_credential
  n8n_cli import:workflow --input=/import/secure-mom.workflow.json
  n8n_cli publish:workflow --id="$WORKFLOW_ID"

  step "Restarting n8n to activate the workflow"
  docker compose restart n8n
  start_and_wait
  check_webhook
  check_mailhog

  cat <<EOF

Secure MOM delivery is running (published on 127.0.0.1 only):
  Webhook  POST $WEBHOOK_URL  (header $TOKEN_HEADER)
  n8n      $N8N_URL  (login $(env_value N8N_OWNER_EMAIL))
  MailHog  $MAILHOG_URL  (login MAILHOG_USER / MAILHOG_PASSWORD in .env; SMTP on 127.0.0.1:1025)
  Secrets  $PWD/$ENV_FILE  (the backend reads SECURE_MOM_N8N_TOKEN from it)
Test it: python3 automation/smoke_test.py
EOF
}

show_owner_password() {
  if [ -n "${owner_password:-}" ]; then
    printf '\nn8n editor password (shown only now, not stored; keep it in a password manager): %s\n' "$owner_password"
  fi
}

main "$@"
