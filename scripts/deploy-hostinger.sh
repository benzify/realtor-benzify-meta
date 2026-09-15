#!/usr/bin/env bash
set -euo pipefail

# Run from the checkout root. Credentials are supplied by GitHub Actions secrets.
for name in HOSTINGER_HOST HOSTINGER_PORT HOSTINGER_USER HOSTINGER_PATH HOSTINGER_URL HOSTINGER_SSH_KEY HOSTINGER_KNOWN_HOSTS; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required deployment setting: %s\n' "$name" >&2
    exit 1
  fi
done

[[ "$HOSTINGER_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo 'Invalid SSH host' >&2; exit 1; }
[[ "$HOSTINGER_USER" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_-]*$ ]] || { echo 'Invalid SSH user' >&2; exit 1; }
[[ "$HOSTINGER_PORT" =~ ^[0-9]{1,5}$ ]] && (( 10#$HOSTINGER_PORT >= 1 && 10#$HOSTINGER_PORT <= 65535 )) || { echo 'Invalid SSH port' >&2; exit 1; }
# Restrict remote shell interpolation to a known, absolute website directory.
[[ "$HOSTINGER_PATH" =~ ^/[a-zA-Z0-9_./-]+$ && "$HOSTINGER_PATH" != '/' && "$HOSTINGER_PATH" != *'..'* ]] || { echo 'Use an absolute website path without spaces or parent traversal' >&2; exit 1; }
[[ "$HOSTINGER_URL" == https://* ]] || { echo 'Use an HTTPS website URL' >&2; exit 1; }
[[ -f dist/index.html && -f dist/styles.css && -f dist/app.js ]] || { echo 'Static site files are missing' >&2; exit 1; }

umask 077
deploy_tmp=$(mktemp -d)
trap 'rm -rf -- "$deploy_tmp"' EXIT
printf '%s\n' "$HOSTINGER_SSH_KEY" > "$deploy_tmp/key"
printf '%s\n' "$HOSTINGER_KNOWN_HOSTS" > "$deploy_tmp/known_hosts"
unset HOSTINGER_SSH_KEY HOSTINGER_KNOWN_HOSTS

ssh_options=(-i "$deploy_tmp/key" -p "$HOSTINGER_PORT" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$deploy_tmp/known_hosts" -o ConnectTimeout=20)
remote="$HOSTINGER_USER@$HOSTINGER_HOST"
ssh "${ssh_options[@]}" "$remote" "test -d '$HOSTINGER_PATH' && test -w '$HOSTINGER_PATH' && command -v rsync >/dev/null"

# Keep server-owned files (including .htaccess and .well-known) intact.
# Transfer assets first and the HTML entrypoint last. No remote deletion.
rsync_shell=ssh
for option in "${ssh_options[@]}"; do
  printf -v quoted_option '%q' "$option"
  rsync_shell+=" $quoted_option"
done
rsync -rlz --chmod=D755,F644 --delay-updates --exclude='.*' --exclude='/index.html' -e "$rsync_shell" dist/ "$remote:$HOSTINGER_PATH/"
rsync -rlz --chmod=F644 --delay-updates -e "$rsync_shell" dist/index.html "$remote:$HOSTINGER_PATH/index.html"

curl --fail --silent --show-error --location --max-time 30 --retry 3 "$HOSTINGER_URL" -o "$deploy_tmp/live.html"
if ! cmp -s dist/index.html "$deploy_tmp/live.html"; then
  echo 'Upload completed, but the live HTML differs. Check the target domain and clear any Hostinger/CDN cache.' >&2
  exit 1
fi
echo 'Hostinger deployment and live HTML verification succeeded.'
