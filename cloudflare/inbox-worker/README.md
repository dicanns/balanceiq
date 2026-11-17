# biq-inbox (Cloudflare Email Worker)

Receives mail sent to `bills+<code>@in.balanceiq.ca` and hands the raw message to
the `inbox` edge function (`/receive`). It does not read the mail. A refusal from
the cloud becomes a permanent rejection for the sender; a network error or a
server error makes the sending server try again later.

Deploy it from this folder:

```bash
npx wrangler deploy
```

Then give both ends the same new shared secret (it is made by the script and never shown):

```bash
bash set-secret.sh
```

Routing is set in the Cloudflare dashboard, not here: Email Routing with the
sub-address `in.balanceiq.ca`, sub-addressing (plus addressing) switched on, and
one rule sending `bills@in.balanceiq.ca` to this worker. Cloudflare has no
catch-all on a sub-address, which is why every company shares the mailbox
`bills` and is told apart by the code after the plus sign.
