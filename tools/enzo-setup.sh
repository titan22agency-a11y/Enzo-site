#!/usr/bin/env bash
# Installs the ENZO store (site + dashboard + feedback) on the Titan server
# at https://enzo.titan22agency.com
# Safe to run again: it updates the app and never touches existing data.
set -euo pipefail
DOMAIN="titan22agency.com"
HOST="enzo.${DOMAIN}"
REPO="https://github.com/titan22agency-a11y/Enzo-site.git"
APP=/opt/enzo-app
DATA=/var/lib/enzo
BACKUPS=/var/backups/enzo
PORT=3200

echo "==> Node.js"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> App code"
id enzo >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin enzo
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only --quiet; else git clone --depth 1 --quiet "$REPO" "$APP"; fi
mkdir -p "$DATA" "$BACKUPS"; chown enzo:enzo "$DATA" "$BACKUPS"; chmod 700 "$DATA" "$BACKUPS"

echo "==> Service"
cat > /etc/systemd/system/enzo.service <<UNIT
[Unit]
Description=ENZO store
After=network.target
[Service]
User=enzo
Environment=ENZO_DATA=${DATA} PORT=${PORT} NODE_NO_WARNINGS=1
ExecStart=/usr/bin/node ${APP}/apps/enzo/server.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA}
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now enzo
systemctl restart enzo

echo "==> Auto-update every 5 minutes + daily backup at 3:30am (keeps 30 days)"
cat > /usr/local/bin/enzo-update <<'UPD'
#!/bin/sh
cd /opt/enzo-app || exit 0
OLD=$(git rev-parse HEAD); git pull --ff-only --quiet || exit 0
[ "$OLD" != "$(git rev-parse HEAD)" ] && systemctl restart enzo
exit 0
UPD
chmod +x /usr/local/bin/enzo-update
cat > /etc/cron.d/enzo <<CRON
*/5 * * * * root /usr/local/bin/enzo-update >/dev/null 2>&1
30 3 * * * enzo ENZO_DATA=${DATA} NODE_NO_WARNINGS=1 /usr/bin/node ${APP}/apps/enzo/server.js backup ${BACKUPS} >/dev/null 2>&1
CRON

echo "==> Web address"
CF=/etc/caddy/Caddyfile
if ! grep -q "^${HOST}" "$CF"; then
  cat >> "$CF" <<CADDY

${HOST} {
	reverse_proxy 127.0.0.1:${PORT}
	encode gzip
	header Strict-Transport-Security "max-age=31536000"
}
CADDY
fi
caddy validate --config "$CF" >/dev/null
systemctl reload caddy

echo "==> Owner account"
sleep 2
if [ ! -f "$DATA/.admin-created" ]; then
  sudo -u enzo ENZO_DATA="$DATA" NODE_NO_WARNINGS=1 node "$APP/apps/enzo/server.js" set-user faris admin "Faris"
  touch "$DATA/.admin-created"; chown enzo:enzo "$DATA/.admin-created"
  echo "    ^ Save this password now. It will not be shown again."
else
  echo "    Owner account already exists."
fi

echo
echo "==> Done."
echo "    Site:      https://${HOST}"
echo "    Dashboard: https://${HOST}/admin"
