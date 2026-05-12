# cross-shop — Phase-1 Capture Playbook

> **Audience:** the human user who has live, logged-in accounts on rohan2.cross.shop, seal-m.cross.shop, and rom.cross.shop, plus a wallet with a small amount of BNB on BSC and CROSS on CROSS Chain.
>
> **Purpose:** this document walks you through the DevTools network captures needed to populate `references/games.json`. Until that file has its `null` slots filled in, the cross-shop skill ships only `games.mjs` — every other subcommand short-circuits with `phase_1_not_captured` (exit code 3).
>
> **Time required:** ~30–60 minutes per game × per rail, mostly waiting for the network tab. You do not need to be a developer to follow it.
>
> **Cost:** capturing `purchase` end-to-end requires actually buying the cheapest product on each rail with a throwaway wallet. Read-path captures (`products`, `login`, `quote`, `orders`, `status`) cost nothing.

---

## 1. Setup (do this once)

### 1.1 Browser

Use a clean Chromium-based browser profile (Chrome, Brave, Edge). Avoid extensions that intercept fetch/XHR (ad blockers, MetaMask portfolio trackers, "request inspectors"). MetaMask the **wallet** is fine — that's expected.

### 1.2 Open DevTools

1. Navigate to the game shop subdomain you intend to capture (e.g. `https://rohan2.cross.shop/`).
2. Open DevTools: **F12** (Windows/Linux) or **Cmd-Option-I** (macOS).
3. Click the **Network** tab.
4. Click the gear icon (⚙) in the top-right of the Network tab and check:
   - **Preserve log** — survives navigations and reloads.
   - **Disable cache** (only while DevTools is open) — avoids stale 304s.
5. In the filter row, click **Fetch/XHR** so you only see API calls (not images / fonts / JS bundles).
6. Hit Cmd-R / Ctrl-R to reload the page so the initial bootstrap calls also land in the log.

### 1.3 Files you will edit

After each capture you will edit two files:

- `references/games.json` — the registry. Replace `null` slots with the captured values.
- `references/cross-shop.md` (this file) — append the captured cURL under the relevant section so future maintainers can reproduce.

Keep `games.json` valid JSON. Use a JSON linter (`jq . games.json`) before saving.

---

## 2. The registry shape (what each slot means)

Each game entry in `references/games.json` has these slots. The columns to the right tell you which subcommand needs that slot before it can run.

| Slot | Type | Example value | Required by |
|---|---|---|---|
| `apiBase` | URL | `"https://rohan2.cross.shop"` or `"https://api.cross.shop"` | every authenticated call |
| `loginPath` | path | `"/api/auth/login"` | `login.mjs` |
| `productsPath` | path | `"/api/v1/products"` | `products.mjs` |
| `quotePath` | path | `"/api/v1/checkout/quote"` | `quote.mjs`, `purchase.mjs` |
| `confirmPath` | path | `"/api/v1/checkout/confirm"` | `purchase.mjs` |
| `ordersPath` | path | `"/api/v1/orders"` | `orders.mjs` |
| `statusPath` | path | `"/api/v1/orders/{id}"` | `status.mjs`, `purchase.mjs` |
| `sessionHeader` | object | `{"kind":"bearer"}` or `{"kind":"cookie","name":"session"}` or `{"kind":"header","name":"X-Session-Token"}` | every authenticated call |
| `escrowCROSS` | object | `{"address":"0x…","abi":[…],"function":"pay","valueArg":"value","orderIdArg":"orderId"}` | `purchase.mjs --pay CROSS` |
| `escrowBSC` | object | same shape | `purchase.mjs --pay BNB` |

**`apiBase`** may be the same as the game subdomain (e.g. `https://rohan2.cross.shop`) or a separate API host (e.g. `https://api.cross.shop`). The `403` we observed on `https://api.cross.shop/` during Phase-0 reconnaissance suggests an internal API exists; the captures below will tell you definitively.

**`sessionHeader.kind`** distinguishes the three common auth-injection shapes you'll observe in DevTools:
- `bearer` → request shows an `Authorization: Bearer <token>` header.
- `cookie` → request shows a `Cookie: <name>=<value>` header you didn't set manually (the back-end issued it via Set-Cookie at login).
- `header` → request shows a custom header like `X-Session-Token: …`.

**`escrow*`** has a richer shape because the on-chain call is what we need to reproduce client-side. Capture details in §6.

---

## 3. Capture the LOGIN endpoint

Do this **once per game**. Result populates `apiBase`, `loginPath`, and `sessionHeader`.

### 3.1 Steps (using rohan2 as the example)

1. Make sure you are signed **out** of `rohan2.cross.shop`. (Open an incognito window if needed.)
2. With DevTools open and recording, click the game shop's "Sign in" / "Login" button.
3. Complete the UUID login the site asks for.
4. After the page redirects to a logged-in state, find the request in DevTools that:
   - has method `POST` (almost always),
   - returns `200`,
   - sends the UUID in its body, and
   - returns a token (or sets a cookie) you can see used on the next request.

Right-click that row → **Copy → Copy as cURL**. Paste it under §3.3 below.

### 3.2 Identify the auth shape

Look at the **response headers** of the login response, AND the **request headers** of the very next API call the page makes:

- If the next call has `Authorization: Bearer …` → `sessionHeader = {"kind":"bearer"}`
  - The token will be in the login response body, typically as `token`, `access_token`, or `data.token`.
- If the login response has `Set-Cookie: <name>=…; HttpOnly` and the next call has `Cookie: <name>=…` (without you setting it) → `sessionHeader = {"kind":"cookie","name":"<name>"}`
  - In this case, the bash/Node client will need to forward the cookie. Note: HttpOnly cookies require the script to extract Set-Cookie from the login response.
- If neither → look for a custom header (e.g. `X-Session-Token`, `X-Auth`) → `sessionHeader = {"kind":"header","name":"<header-name>"}`.

### 3.3 Paste captures here

```bash
# rohan2 — captured YYYY-MM-DD by <you>
# curl 'https://rohan2.cross.shop/api/auth/login' \
#   -H 'Content-Type: application/json' \
#   --data-raw '{"uuid":"REDACTED"}'
# Response: {"token":"…","expires_at":"…"}
# sessionHeader = {"kind":"bearer"}

# seal-m — captured YYYY-MM-DD by <you>
# (paste cURL here)

# rom — captured YYYY-MM-DD by <you>
# (paste cURL here)
```

### 3.4 Update games.json

```json
{
  "rohan2": {
    "apiBase": "https://rohan2.cross.shop",
    "loginPath": "/api/auth/login",
    "sessionHeader": { "kind": "bearer" }
  }
}
```

Run `node scripts/games.mjs` and confirm `rohan2.missingSlots` no longer includes `apiBase`, `loginPath`, `sessionHeader`.

Then test: `PRIVATE_KEY=0x… node scripts/login.mjs rohan2 --uuid <UUID>`. Expect `{ok:true, persisted:false, ...}`. Repeat for the other two games.

---

## 4. Capture the PRODUCTS catalog endpoint

Do this **once per game**. Result populates `productsPath`.

### 4.1 Steps

1. Reload the game-shop landing page with DevTools recording.
2. The page renders package cards. Find the request that returned the data those cards are built from. Tell-tale signs:
   - method `GET` (usually),
   - returns `200`,
   - response body is a JSON array (or object with an `items` / `products` array) whose entries have the same names/prices you see rendered on the page.
3. Right-click → **Copy as cURL**. Paste under §4.3.

If the catalog renders server-side (Next.js SSR — the rohan2 page does this), there may be **no** XHR/fetch for it. In that case:

a. Open the **Doc** tab in the network filter (instead of Fetch/XHR).
b. Find the page's HTML response — it will have `<script id="__NEXT_DATA__">…</script>` containing the catalog.
c. Look at the `_next/data/<buildId>/<game>.json` URL pattern — that's the JSON the page would re-fetch on client navigation. Capture that.

### 4.2 Normalize the field names

The `products.mjs` script expects each row to have:

| Field | Source likely |
|---|---|
| `productId` | `id`, `productId`, `sku`, `slug` |
| `name` | `name`, `title` |
| `priceUsd` | `priceUsd`, `priceUsdCents/100`, `price.usd` |
| `priceCROSS` | `priceCross`, `prices.cross`, `priceTokens.cross` |
| `priceBNB` | `priceBnb`, `prices.bnb`, `priceTokens.bnb` |
| `image` | `imageUrl`, `image`, `cover` |
| `category` | `category`, `tag`, `tier` |
| `weeklyCapRemaining` | `weeklyCapRemaining`, `weeklyLimit.remaining` |

Note in §4.3 which back-end fields you observed and which `products.mjs`-canonical name they map to. The next maintainer (or v0.2) can wire that mapping into a normalizer.

### 4.3 Paste captures here

```bash
# rohan2 products — captured YYYY-MM-DD
# curl 'https://rohan2.cross.shop/api/v1/products'
# Response shape: { items: [ { id, name, price_usd, price_cross, price_bnb, image_url, category } ] }

# seal-m products — captured YYYY-MM-DD
# (paste cURL here)

# rom products — captured YYYY-MM-DD
# (paste cURL here)
```

### 4.4 Update games.json

Set `productsPath` for each game, then run `node scripts/products.mjs <game>`.

---

## 5. Capture the QUOTE endpoint

Do this **once per (game × rail) cell** — i.e. up to 6 captures: rohan2/CROSS, rohan2/BNB, seal-m/CROSS, seal-m/BNB, rom/CROSS, rom/BNB.

Result populates `quotePath` per game. The rail does not change the path; it changes the request body and the response payload (different escrow address per rail).

### 5.1 Steps

1. Logged in to the game shop, click the cheapest product card.
2. On the checkout page (or inline modal), select the **CROSS** payment rail.
3. **Do NOT click Pay yet.** Watch the network tab for the request that:
   - method `POST` (usually) or `GET` with query params,
   - returns the `orderId` (or `order_id`, `quote_id`, `intent_id`),
   - returns the `escrow address` (the contract you'd send funds to),
   - returns the `amount` (in wei or token units),
   - returns the `priceUsd`.
4. Right-click → **Copy as cURL**. Paste under §5.3.
5. Switch the rail selector to **BNB**. The page should re-issue the quote. Capture that response too — note the different escrow address (it'll be a BSC contract, not a CROSS contract).

### 5.2 The "fresh-quote binding" guarantee

The skill enforces that the `paymentTarget` used at signing time MUST come from a quote returned within the same `purchase.mjs` invocation (REQUIREMENTS SEC-08). This is to prevent stale-quote replay (a refreshed price would otherwise leave the user paying yesterday's amount).

For the capture, that means: do **not** copy a quote response from a session you closed. Each invocation re-quotes.

### 5.3 Paste captures here

```bash
# rohan2 / CROSS quote — captured YYYY-MM-DD
# curl 'https://rohan2.cross.shop/api/v1/checkout/quote' \
#   -H 'Authorization: Bearer …' \
#   --data-raw '{"product_id":"…","rail":"CROSS"}'
# Response: { order_id, escrow_address, amount_wei, price_usd, expires_at }

# rohan2 / BNB quote — captured YYYY-MM-DD
# (paste cURL here — note the BSC escrow address differs)

# seal-m / CROSS quote — captured YYYY-MM-DD
# (paste cURL here)

# seal-m / BNB quote — captured YYYY-MM-DD
# (paste cURL here)

# rom / CROSS quote — captured YYYY-MM-DD
# (paste cURL here)

# rom / BNB quote — captured YYYY-MM-DD
# (paste cURL here)
```

### 5.4 Update games.json

Set `quotePath` per game. Note: `escrowCROSS.address` and `escrowBSC.address` come from these quote responses (they should be **stable per game** — see §6 to confirm).

---

## 6. Capture the PAYMENT ESCROW ABI

Do this **once per (game × chain) cell** that you intend to use. Result populates `escrowCROSS` and/or `escrowBSC` per game. The contract may be shared across games (one shop-wide escrow) or per-game (segmented escrows). The capture tells you definitively.

### 6.1 Find the contract address

Look at the `escrow_address` field returned by your `quote` capture in §5. That's the on-chain contract you'll be calling.

### 6.2 Pull the verified ABI

For **CROSS Chain (612055)**:

1. Visit `https://explorer.crosstoken.io/612055/address/<escrow_address>`. (Note: this is the Next.js UI; for the JSON ABI you usually want the Blockscout API.)
2. Alternative: `https://www.crossscan.io/address/<escrow_address>` — Blockscout-based explorer.
3. Click **Contract** tab → **Code** sub-tab. If "Contract Source Code Verified" is shown, scroll to the **Contract ABI** section.
4. Click "Copy ABI" or copy the JSON array.
5. **If the contract is NOT verified**: you'll need to derive the function signature from the on-chain calldata of a known successful payment tx. Open a recent tx for that escrow (DevTools → search for the tx hash returned by an actual purchase, or use `crossscan.io`'s "Transactions" tab). Inspect the input data: the first 4 bytes are the function selector. Decode it via `4byte.directory` or by trial-and-error against likely names (`pay`, `purchase`, `payOrder`, `submitPayment`).

For **BSC (56)**:

1. Visit `https://bscscan.com/address/<escrow_address>`.
2. Same process: **Contract** → **Code** → copy ABI.
3. Verified contracts on BscScan are extremely common.

### 6.3 Identify the payment function

In the ABI, find the function that:
- is `payable` (because the user sends native CROSS or BNB as `msg.value`),
- takes the `orderId` (string or bytes32) as one of its arguments.

Likely names: `pay`, `payOrder`, `purchase`, `submitPayment`, `deposit`. The exact name is contract-specific.

Record the function name AND which arg is the `orderId` and which is the `value` (if explicit; `msg.value` is implicit).

### 6.4 Paste captures here

```bash
# CROSS escrow (rohan2 — or shared) — captured YYYY-MM-DD
# Address: 0x…
# Verified: yes/no
# Function: pay(bytes32 orderId) payable
# ABI (excerpt):
#   [{"inputs":[{"name":"orderId","type":"bytes32"}],"name":"pay","stateMutability":"payable","type":"function"}]

# BSC escrow (rohan2 — or shared) — captured YYYY-MM-DD
# Address: 0x…
# Verified: yes/no
# Function: pay(bytes32 orderId) payable
# ABI (excerpt):
#   [{"inputs":[{"name":"orderId","type":"bytes32"}],"name":"pay","stateMutability":"payable","type":"function"}]
```

### 6.5 Update games.json

```json
{
  "rohan2": {
    "escrowCROSS": {
      "address": "0x…",
      "function": "pay",
      "orderIdArg": "orderId",
      "valueArg": null,
      "abi": [ /* paste here */ ]
    },
    "escrowBSC": {
      "address": "0x…",
      "function": "pay",
      "orderIdArg": "orderId",
      "valueArg": null,
      "abi": [ /* paste here */ ]
    }
  }
}
```

If the escrow is shared across all three games on a chain, you can copy the same `escrowCROSS` (or `escrowBSC`) value into each game entry — that's fine, the script reads it per-game.

---

## 7. Capture the CONFIRM endpoint

Do this **once per game** (not per rail — the same confirm endpoint usually serves both rails). Result populates `confirmPath`.

### 7.1 Steps

1. From §5 you have a fresh quote with an `orderId`. From §6 you have the escrow ABI.
2. **Manually** (in MetaMask or another wallet UI) send the on-chain payment tx to the escrow address with the orderId as the function argument and the quoted amount as msg.value. Wait for confirmation.
3. Back on the cross.shop page, click the "I've paid" / "Confirm" button (or the page may auto-detect and POST without your click). Watch DevTools.
4. Find the request that:
   - method `POST`,
   - body contains the `orderId` AND the on-chain `txHash`,
   - returns a success response.
5. Right-click → **Copy as cURL**. Paste under §7.3.

### 7.2 Why this matters

Some back-ends index payments off-chain via event listening on the escrow contract — in which case the confirm POST is just a *hint* to speed up indexing, not strictly required. Others won't trigger delivery until the confirm POST lands. The capture tells you which.

### 7.3 Paste captures here

```bash
# rohan2 confirm — captured YYYY-MM-DD
# curl 'https://rohan2.cross.shop/api/v1/checkout/confirm' \
#   -H 'Authorization: Bearer …' \
#   --data-raw '{"order_id":"…","tx_hash":"0x…"}'

# seal-m confirm — captured YYYY-MM-DD
# (paste cURL here)

# rom confirm — captured YYYY-MM-DD
# (paste cURL here)
```

### 7.4 Update games.json

Set `confirmPath` per game.

---

## 8. Capture the ORDERS history endpoint

Do this **once per game**. Result populates `ordersPath`.

### 8.1 Steps

1. Navigate to the "My Orders" / "Order History" page on the game shop while logged in.
2. Find the GET request that returned the visible order rows.
3. Right-click → **Copy as cURL**. Paste under §8.3.

### 8.2 Schema fields to capture

The `orders.mjs` script consumes these fields per row. Note in §8.3 which of the back-end's field names map to each:

| Canonical | Source likely |
|---|---|
| `orderId` | `id`, `order_id` |
| `productId` | `product_id`, `sku` |
| `productName` | `product_name`, `name` |
| `priceUsd` | `price_usd`, `amount_usd` |
| `rail` | `rail`, `payment_method`, `currency` |
| `txHash` | `tx_hash`, `payment_tx_hash` |
| `chainId` | `chain_id`, derive from `rail` |
| `deliveryStatus` | `delivery_status`, `status` |
| `createdAt` | `created_at`, `placed_at` |

### 8.3 Paste captures here

```bash
# rohan2 orders — captured YYYY-MM-DD
# curl 'https://rohan2.cross.shop/api/v1/orders?limit=25' \
#   -H 'Authorization: Bearer …'

# seal-m orders — captured YYYY-MM-DD
# (paste cURL here)

# rom orders — captured YYYY-MM-DD
# (paste cURL here)
```

### 8.4 Update games.json

Set `ordersPath` per game.

---

## 9. Capture the STATUS endpoint

Do this **once per game**. Result populates `statusPath`.

### 9.1 Steps

1. Click into a single order on the "My Orders" page (or open the order detail modal).
2. Find the GET that returns the single-order detail.
3. Right-click → **Copy as cURL**. Paste under §9.3.

The `statusPath` value typically contains a placeholder like `"/api/v1/orders/{id}"`. The Node side substitutes `{id}` from the `<orderId>` arg. (Today the skeleton hard-codes `query: { orderId }`; once you have the real shape you can update `_api.mjs` or use a query-param style instead.)

### 9.2 Distinguish on-chain vs back-end status

A single order has TWO independent status dimensions:

- **on-chain status**: did the escrow tx confirm? Encoded in `tx_hash` + chain explorer lookup. The skill computes this from the chain via viem if needed.
- **delivery status**: did the back-end mark the order `delivered`? This is the field `status.mjs` polls until terminal.

The skill's envelope surfaces both. Note in §9.3 which back-end field maps to `deliveryStatus` (most likely `status` or `delivery_status`).

### 9.3 Paste captures here

```bash
# rohan2 single-order status — captured YYYY-MM-DD
# curl 'https://rohan2.cross.shop/api/v1/orders/<orderId>' \
#   -H 'Authorization: Bearer …'
# Response: { order_id, status, tx_hash, delivered_at? }

# seal-m single-order status — captured YYYY-MM-DD
# (paste cURL here)

# rom single-order status — captured YYYY-MM-DD
# (paste cURL here)
```

### 9.4 Update games.json

Set `statusPath` per game.

---

## 10. Final verification

After all captures, run:

```bash
node scripts/games.mjs | jq '.games[] | {slug, missingSlots}'
```

Each game's `missingSlots` should be `[]`. If any slot remains `null`, the corresponding subcommand will still error with `phase_1_not_captured`.

Then smoke-test, in order, with a throwaway test wallet:

```bash
node scripts/games.mjs                                       # works without anything
node scripts/products.mjs rohan2                             # needs apiBase + productsPath
PRIVATE_KEY=0x… node scripts/login.mjs rohan2 --uuid <UUID>  # needs apiBase + loginPath + sessionHeader
node scripts/quote.mjs rohan2 <productId> --pay CROSS        # needs apiBase + quotePath
PRIVATE_KEY=0x… node scripts/purchase.mjs rohan2 <productId> --pay CROSS --confirm
                                                              # needs everything + escrowCROSS
node scripts/orders.mjs rohan2                               # needs ordersPath + active session
node scripts/status.mjs rohan2 <orderId>                     # needs statusPath
```

For purchase, use the cheapest product on the cheapest rail first. Set `MAX_PURCHASE_NOTIONAL=5` and `CONFIRM_THRESHOLD=1` in your `.env` to keep blast-radius minimal during testing.

---

## 11. TOS and credential handling reminders

- The skill enforces "operate only on the user's own UUID and wallet." Don't capture another player's session. Don't re-distribute captured cURLs that still contain a live token.
- Tokens captured in §3 expire. Note the `expires_at` field if present so v0.2 can implement refresh.
- If any back-end returns `403`/`401` consistently for your captures, the game shop may have blocked programmatic access for your account or region. Surface this to the user verbatim in the error envelope; do not retry silently.
- Game UUIDs are credentials. Mask them when pasting cURLs into this file (`--data-raw '{"uuid":"REDACTED"}'`). The skill's runtime hashes them to sha256 at rest; do not undo that by leaking the raw value in source control.

---

## 12. Where to ask if you get stuck

- The four sibling skills (`skill-cross-dex-trade`, `skill-cross-prediction`, `skill-cross-rewards`, `skill-cross-crossd`) all use the same EOA + viem + raw-HTTPS pattern. Read their `references/` for capture-style examples.
- `cross-skills/skill-cross-crossd/references/cross-crossd.md` is the closest analog: it documents the `bridge-api.crosstoken.io` endpoint table and the on-chain bridge router ABI. Same skeleton applies here.
- `CONTEXT.md` (repo root) lists the precise terminology to use in code and docs (e.g. `cross.shop` lowercase, `payment escrow` not `escrow router`, `orderId` not `txRef`).
