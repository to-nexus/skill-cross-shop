---
name: cross-shop
description: This skill should be used when the user asks to drive the cross.shop game web-shop platform (https://www.cross.shop) and its per-game subdomains rohan2.cross.shop, seal-m.cross.shop, rom.cross.shop — list game shops, fetch product catalogs, log in with a Game UUID, quote a purchase against a payment rail (CROSS or BNB), execute the on-chain payment leg via the per-chain payment escrow, and poll back-end delivery status. v0.1-rc-skeleton ships the registry-driven scaffold; only `games` works without Phase-1 DevTools captures, and write subcommands (`login`, `purchase`, `orders`, `status`, `products`, `quote`) error with `phase_1_not_captured` until references/cross-shop.md is followed to populate references/games.json. Triggers on phrases like "rohan2 샵에서 살 수 있는 패키지 목록 보여줘", "seal-m 샵의 weekly costume 상품 BNB로 사줘", "ROM 게임 상품 CROSS로 결제해", "cross.shop 게임 목록", "list cross.shop games", "rohan2 product list", "buy seal-m package with CROSS", "list available games on cross.shop", "show my cross.shop order history for rohan2", "ROM 샵 주문 상태 확인".
version: 0.1.0-rc.skeleton
license: MIT
---

# cross.shop — Game Web-Shop Driver

A distributable skill that lets Claude drive the **cross.shop** game web-shop platform (Nexus HUB FZCO) — the same back-end that powers `https://www.cross.shop` and its per-game subdomains `rohan2.cross.shop`, `seal-m.cross.shop`, `rom.cross.shop`. Execution path is **EOA + viem + raw HTTPS** — no browser automation, no ERC-4337.

> **v0.1-rc-skeleton — what ships today**
>
> The user has explicitly chosen to release the runnable scaffold *before* the Phase-1 reverse-engineering pass. This means:
>
> - `games.mjs` works **today** (it just emits `references/games.json` content).
> - `products`, `login`, `quote`, `purchase`, `orders`, `status` all short-circuit with `{ok:false, error:"phase_1_not_captured", missing:"<slug>.<key>", hint:"see references/cross-shop.md"}` and **exit 3**.
> - `purchase --pay CARD` errors with `unsupported_rail_v0_1` (deferred to v0.2 — hosted-checkout path).
> - To unlock the rest, follow the capture playbook at `references/cross-shop.md` (DevTools network tap → cURL → registry update). No code changes required after that — the scripts read from `references/games.json`.

> **Scope (v0.1):** read-path (`games`, `products`, `quote`, `orders`, `status`) and write-path (`login`, `purchase`) — both wired to per-game adapters from `references/games.json`. Payment rails: `CROSS` (CROSS Chain `612055`, native CROSS) and `BNB` (BSC `56`, native BNB). Card payments are explicitly out of scope.

> Deeper protocol details (per-game endpoint table, payment escrow ABI map, capture provenance) live in `references/cross-shop.md`. Read it only when needed — it stays out of context otherwise.

---

## 1. Activation

Activate when the user wants to:

- **List** the supported game shops (currently `rohan2`, `seal-m`, `rom`) with their subdomain, supported payment rails, and how complete their adapter is
- **Browse** the product catalog of one game shop and surface `productId`, `name`, `priceUsd`, `priceCROSS`, `priceBNB`, `image`, `category`, optional `weeklyCapRemaining`
- **Authenticate** with a per-player Game UUID and (optionally) persist the session locally
- **Quote** a purchase by `(game, productId, payment rail)` — back-end-supplied `paymentTarget` (escrow + amount + orderId memo) without signing
- **Execute** a purchase: `quote → preflight → on-chain payment to escrow on the chosen rail → POST /orders/confirm → poll delivery status`
- **Read** order history for the resolved session
- **Poll** a single order to terminal delivery state

Trigger phrases (Korean + English, ≥ 6 each):

- KR:
  - `"rohan2 샵에서 살 수 있는 패키지 목록 보여줘"` / `"rohan2 상품 목록"`
  - `"seal-m 샵의 weekly costume 상품 BNB로 사줘"` / `"seal-m 패키지 구매"`
  - `"ROM 게임 상품 CROSS로 결제해"` / `"ROM 샵 주문"`
  - `"cross.shop 게임 목록"` / `"크로스샵 게임 보여줘"`
  - `"내 UUID로 rohan2 샵 로그인"` / `"rohan2 샵 로그인"`
  - `"cross.shop 주문 내역"` / `"내 cross.shop 구매 이력"`
  - `"ROM 샵 주문 상태 확인"` / `"orderId 상태 polling"`
- EN:
  - `"list available games on cross.shop"` / `"show cross.shop game shops"`
  - `"rohan2 product list"` / `"show rohan2 catalog"`
  - `"buy seal-m package with CROSS"` / `"purchase seal-m product on BNB rail"`
  - `"login to rohan2 with my game uuid"` / `"authenticate rohan2 shop"`
  - `"show my cross.shop order history for rohan2"` / `"list rohan2 orders"`
  - `"check cross.shop order status"` / `"poll orderId delivery"`
  - `"quote a cross.shop purchase"` / `"price a rohan2 package on CROSS"`

The skill operates **only on the user's own Game UUID and their own wallet**. It is not designed to scrape, resell, or batch-buy on behalf of third parties; activate accordingly.

---

## 2. Prerequisites — verify before doing anything else

Run these checks in order. Stop and report to the user at the first failure.

```bash
node --version          # require >= 20
```

Then ensure the script's deps are installed (one-time):

```bash
SKILL_DIR="$HOME/.claude/skills/cross-shop"
[ -d "$SKILL_DIR/node_modules" ] || (cd "$SKILL_DIR" && npm install --silent)
```

**Capture status check** (skeleton-only): every subcommand except `games` will fail with `phase_1_not_captured` if the corresponding endpoint slot in `references/games.json` is `null`. Run `node scripts/games.mjs` first and inspect each game's `missingSlots` to know what's available.

`games` works without any private key or session. Read-path commands that depend on captured slots (`products`, `quote`, `status` if anonymous) need only the registry to be populated. `login`, `purchase`, `orders` additionally need a `PRIVATE_KEY` and a Game UUID.

---

## 3. Credential resolution — strict priority

Two distinct credentials are involved: the **EOA private key** (signs the on-chain payment) and the **Game UUID** (logs into the game shop back-end). Both are treated as secrets — never echoed, never written to logs, never persisted in raw form.

### 3.1 PRIVATE_KEY

Resolve in this order. **Never echo wallet secrets back to the user, never write them into the conversation transcript, never log them, and never ask the user to paste them into chat.**

1. **`process.env.PRIVATE_KEY`** — inherited by the spawned process, not typed into the chat transcript or shell argv.
2. **`./.env` in the user's current working directory** — read `PRIVATE_KEY` and (optionally) `WALLET_ADDRESS`, `CROSS_RPC_URL`, `BSC_RPC_URL`, `MAX_PURCHASE_NOTIONAL`, `CONFIRM_THRESHOLD`, `MIN_GAS_NATIVE`, `RECEIPT_TIMEOUT`.
3. **`$HOME/.claude/skills/cross-shop/.env`** — same vars, used as the personal default.
4. **Missing signer config** — if all three sources lack `PRIVATE_KEY` and the requested subcommand needs it, stop. Tell the user to create `~/.claude/skills/cross-shop/.env` locally with:

   ```bash
   PRIVATE_KEY=<0x-prefixed-64-hex-secret>
   MAX_PURCHASE_NOTIONAL=100
   CONFIRM_THRESHOLD=10
   MIN_GAS_NATIVE=0.001
   ```

   Then ask them to re-run the request. Do not collect the secret in chat, and do not pass it on the command line.

Validation: the value must match `^0x[0-9a-fA-F]{64}$`. Reject otherwise without retrying silently. Read-path subcommands NEVER prompt for a PK.

### 3.2 GAME_UUID (per game)

Resolve in this order:

1. `--uuid <UUID>` flag on the `login.mjs` invocation.
2. `process.env.GAME_UUID_<SLUG_UPPER_SNAKE>` — e.g. `GAME_UUID_ROHAN2`, `GAME_UUID_SEAL_M`, `GAME_UUID_ROM`.
3. **Ask the user** — only if neither source has it and `login.mjs` was requested.

The UUID is held in process memory only; at rest only `sha256(uuid)` is stored in `~/.claude/skills/cross-shop/.sessions/<game>.json` (when `--persist` is set). Never echo the raw UUID.

### 3.3 Session token

After a successful `login.mjs --persist`, the session token is in `~/.claude/skills/cross-shop/.sessions/<game>.json` (mode `0600`). Subsequent auth-required calls (`orders`, `status` if gated, `purchase`'s confirm leg) load it via `_session.loadSession(game)`. The file owner is checked against the running uid.

---

## 4. Safety rails — apply every time

Read-path scripts cannot lose funds. The rails below are enforced verbatim by `purchase.mjs` (via `_guard.mjs`) for every write path:

1. **Payment-chain id check** — `--pay CROSS` ⇒ chain `612055`; `--pay BNB` ⇒ chain `56`. Every signed tx aborts unless `eth_chainId` matches.
2. **`MAX_PURCHASE_NOTIONAL` cap** (USD) — env var; if set, abort if `quote.priceUsd` exceeds it. Default `100`.
3. **`CONFIRM_THRESHOLD` + `--confirm` gate** (USD) — any purchase above this aborts with `{ok:false, error:"awaiting_confirm", parsedIntent}` exit 2 unless `--confirm` is passed. Default `10`.
4. **`MIN_GAS_NATIVE` pre-flight** — abort before signing if the payment-chain native balance is below the floor (default `0.001`). Set to `0` to skip.
5. **Game existence guard** — abort with `unknown_game` if `<game>` isn't in `references/games.json`.
6. **Product existence guard** — abort with `unknown_product` if `<productId>` isn't in the latest `products` response.
7. **Fresh-quote binding** — never sign a payment whose `paymentTarget` was not freshly returned by `quote.mjs` within the same invocation. Replays of stale quotes are refused.
8. **`orderId` calldata binding** — the on-chain escrow tx data MUST include the back-end-supplied `orderId` reference; if the contract requires `payable` + memo, both must be present.
9. **Receipt-after-payment polling** — `purchase.mjs` MUST poll `status` for at least `RECEIPT_TIMEOUT` (default 120s) after the on-chain confirm. If the back-end has not transitioned past `pending`, the envelope returns `{ok:true, deliveryStatus:"pending", txHash, orderId}` — never `ok:false` (the on-chain leg succeeded).
10. **Approval hygiene** — if a future product price requires an ERC-20 approval (currently v0.1 is native-only), default to **exact-amount** approval; opt-in `--max-approve` for unlimited.
11. **`WALLET_ADDRESS` mismatch warning** — non-null `signerWarn` field when env-declared address ≠ PK-derived address. Surface to user before continuing.
12. **`unsupported_rail_v0_1`** — `purchase --pay CARD` aborts immediately with this code; surface the hint to finish in browser.
13. **Never echo PK or UUID** — same as siblings.

---

## 5. Execution

All subcommands run via Bash and emit a **single JSON object on stdout** (no decorative prose). Parse the envelope and report key fields back. Stderr stays empty unless `DEBUG=1`.

```bash
cd "$HOME/.claude/skills/cross-shop"
node scripts/<subcommand>.mjs [args]
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | runtime error (network, RPC, parse) |
| 2 | user error (bad args, unknown_game, unknown_product, awaiting_confirm) |
| 3 | `phase_1_not_captured` — registry slot is `null`; capture via DevTools first |

### NL → subcommand map

| User says (KR / EN) | Subcommand |
|---|---|
| "cross.shop 게임 목록" / "list cross.shop games" | `node scripts/games.mjs` |
| "rohan2 상품 목록" / "show rohan2 catalog" | `node scripts/products.mjs rohan2` |
| "seal-m 패키지" / "list seal-m products" | `node scripts/products.mjs seal-m` |
| "ROM 상품" / "show rom catalog" | `node scripts/products.mjs rom` |
| "내 UUID로 rohan2 샵 로그인" / "login to rohan2 with my UUID" | `node scripts/login.mjs rohan2 --uuid <UUID> --persist` |
| "rohan2 Sapphire Package CROSS 견적" / "quote rohan2 <id> on CROSS" | `node scripts/quote.mjs rohan2 <productId> --pay CROSS` |
| "seal-m 패키지 BNB 견적" / "quote seal-m <id> on BNB" | `node scripts/quote.mjs seal-m <productId> --pay BNB` |
| "rohan2 Sapphire Package CROSS로 결제" / "buy rohan2 <id> with CROSS" | `node scripts/purchase.mjs rohan2 <productId> --pay CROSS [--confirm]` |
| "seal-m weekly BNB로 사줘" / "purchase seal-m <id> with BNB" | `node scripts/purchase.mjs seal-m <productId> --pay BNB [--confirm]` |
| "내 cross.shop rohan2 주문" / "list my rohan2 orders" | `node scripts/orders.mjs rohan2` |
| "ROM 주문 abc-123 상태 확인" / "status of rom orderId abc-123" | `node scripts/status.mjs rom abc-123` |
| "5초마다 주문 상태 확인" / "watch order status every 5s" | `node scripts/status.mjs <game> <orderId> --watch 5` |

### Subcommand cheat-sheet

- `games` — list seeded games with capture status. **Works today, no PK or UUID needed.**
- `products <game>` — fetch product catalog (post-Phase-1).
- `login <game> --uuid <UUID> [--persist]` — exchange UUID for session token.
- `quote <game> <productId> --pay <CROSS|BNB>` — back-end quote, no signing.
- `purchase <game> <productId> --pay <CROSS|BNB> [--confirm]` — full flow. `--pay CARD` → `unsupported_rail_v0_1`.
- `orders <game> [--limit N]` — read order history (auth required).
- `status <game> <orderId> [--watch <sec>]` — poll a single order.

---

## 6. Reporting back

After every action, surface to the user:

- The parsed intent (so they can audit it) — echo the `parsedIntent` field
- For `games`: count, slug list, per-game `capturedSlots` / `missingSlots` summary
- For `products`: count + first few `{productId, name, priceUsd, category}` rows
- For `login`: whether the session was persisted, expiry timestamp (if returned), **never the token itself**
- For `quote`: `priceUsd`, `paymentChainId`, `escrow`, `amountHuman`, `orderIdRef`, `gasEstimateWei`
- For `purchase`: `txHash` + chain explorer link, `orderId`, `deliveryStatus` (may be `pending`), `signerWarn` if any
- For `orders`: count + per-row `{orderId, productId, txHash, deliveryStatus}`
- For `status`: `deliveryStatus`, `terminal` flag, raw payload

Never include the PK, raw UUID, or session token in the report. If the envelope contains a non-null `signerWarn`, surface the mismatch before declaring success.

For `awaiting_confirm` errors (exit code 2), summarize the parsed intent and the back-end-quoted `priceUsd`, ask the user explicitly for "yes / 진행", and only re-invoke with `--confirm` on confirmation.

For `phase_1_not_captured` errors (exit code 3), surface the `missing` field (e.g. `"rohan2.loginPath"`) and the `hint` (`"see references/cross-shop.md ..."`). Tell the user the skeleton can't proceed until they run the capture playbook for that cell.

For `unsupported_rail_v0_1` errors (`--pay CARD`), surface the hint URL and tell the user that hosted-checkout / 3DS is deferred to v0.2.

---

## 7. Distribution

This skill folder is the unit of distribution. Recipients:

1. Copy the whole `cross-shop/` folder into `~/.claude/skills/`, OR run the package's `install.sh` to symlink it.
2. Run `cd ~/.claude/skills/cross-shop && npm install` once (or let `install.sh` do it).
3. (Required for `login` / `purchase` / `orders`) create `~/.claude/skills/cross-shop/.env` from `.env.example`.
4. **Run the capture playbook at `references/cross-shop.md`** to populate `references/games.json` for the games and rails you actually want to use. Until then, only `games.mjs` works.

Cross-link: deeper details (per-game endpoint table, payment escrow ABI provenance, capture provenance) live in `references/cross-shop.md`. Lazy-load it only when an endpoint returns an unfamiliar shape, or when populating a new game slot.
