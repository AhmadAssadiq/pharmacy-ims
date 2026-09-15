# shared

Constants shared by the React client and the Node.js server so both sides agree on
role names, alert statuses and the business thresholds (low-stock level, near-expiry
window, forecast horizon and login lockout policy).

`constants.json` is plain JSON so it can be imported by Node (`require`) and by
Vite (`import`) without a build step.
