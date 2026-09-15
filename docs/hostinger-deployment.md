# Hostinger deployment

The workflow uploads the contents of `dist/` over SSH using rsync. It runs only through **Actions → Deploy to Hostinger → Run workflow** on `main`; pushing changes does not deploy. No build is needed.

## Setup

1. Enable SSH in Hostinger and identify the exact absolute document root for this domain. Confirm that it is the intended static site before enabling deployments.
2. Generate a dedicated deployment key and add its public key to Hostinger. Store the private key only in the GitHub repository secret `HOSTINGER_SSH_KEY`.
3. Verify the server's SSH host key through a trusted connection and store its known-hosts entry in the repository secret `HOSTINGER_KNOWN_HOSTS`. Nonstandard ports use `[host]:port` in that entry. The workflow does not blindly trust keys obtained during deployment.
4. Configure repository variables:

| Variable | Value |
| --- | --- |
| `HOSTINGER_HOST` | SSH hostname or IPv4 address |
| `HOSTINGER_PORT` | SSH port shown in Hostinger |
| `HOSTINGER_USER` | SSH username |
| `HOSTINGER_PATH` | Existing absolute website directory, without spaces |
| `HOSTINGER_URL` | Final HTTPS landing page URL |
| `HOSTINGER_ENABLED` | Set to `true` only after setup is complete |

Deployments are skipped until `HOSTINGER_ENABLED` is `true`. Manual runs are restricted to `main`.

## Behavior and recovery

- Only static files are uploaded. Hidden files, including Sites metadata, are excluded.
- SSH host keys are checked strictly. Credentials are kept in a temporary directory and removed after the job.
- Existing files with matching names are updated; unrelated server files are retained. Removed source assets are not automatically removed from the server.
- Assets upload before `index.html`. Uploads are not a fully atomic release; a failed job can leave some assets updated. Re-run the last successful commit after correcting a failure, or revert a bad commit on `main` and manually deploy again.
- The job fetches the live URL and compares its HTML to the source. An active cache or HTML transformation can cause verification failure after a successful upload; investigate the response and purge the cache before rerunning.
- Deployments run one at a time and have a ten-minute timeout.

Setup is not complete until an authenticated deployment and live verification have succeeded.
