#!/bin/sh
# Local mail catcher for the minutes emails: nothing leaves this computer.
#   SMTP  127.0.0.1:1025  (the API sends here, see SMTP_HOST / SMTP_PORT in .env)
#   inbox http://127.0.0.1:8025
# Install once: brew install mailpit
cd "$(dirname "$0")/.." || exit 1
mkdir -p storage
exec mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --database storage/mailpit.db "$@"
