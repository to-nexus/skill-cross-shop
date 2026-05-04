# cross-shop

A Claude Code skill that drives the **cross.shop** game web-shop platform (`https://www.cross.shop`) and its per-game subdomains `rohan2.cross.shop`, `seal-m.cross.shop`, `rom.cross.shop` — list game shops, fetch product catalogs, log in with a Game UUID, quote a purchase against a payment rail (CROSS or BNB), execute the on-chain payment leg via the per-chain payment escrow, and poll back-end delivery status. Targets **CROSS Chain (chain id 612055)** and **BSC (56)**.

- **Stack:** EOA + viem (no ERC-4337, no paymaster, no Playwright)
- **Backends:** per-game shop API (subdomain or shared `api.cross.shop`); endpoint slots populated via Phase-1 DevTools captures into `references/games.json`
- **Subcommands:** `games`, `products`, `login`, `quote`, `purchase`, `orders`, `status`
- **Distribution:** standalone Claude skill **and** wrapped as a Claude Code plugin

> **v0.1-rc-skeleton — runnable scaffold, Phase-1 captures pending.**
>
> Only `games.mjs` runs end-to-end today (it just emits the registry). Every other subcommand short-circuits with `{ok:false, error:"phase_1_not_captured", missing:"<slug>.<key>"}` and exit code 3 until you follow `skills/cross-shop/references/cross-shop.md` to populate `references/games.json` for the games and rails you actually want to use.
>
> `purchase --pay CARD` errors with `unsupported_rail_v0_1` (hosted-checkout / 3DS deferred to v0.2).

> 🔒 **Private repository.** Owner (`to-nexus`) installs via `gh auth login`. Others need collaborator access or `GITHUB_TOKEN`.

---

## Install — Recommended (via Marketplace)

```bash
/plugin marketplace add github.com/to-nexus/cross-skills-suite
/plugin install cross-shop@cross-skills-suite
```

Part of the [CROSS Skills Suite](https://github.com/to-nexus/cross-skills-suite) — installs alongside `cross-rewards`, `cross-dex-trade`, `cross-prediction`, `cross-crossd`, ``.

---

## Install — Standalone

### Option 1 — Plain skill (one user, fastest)

```bash
git clone <this-repo> /tmp/skill-cross-shop
bash /tmp/skill-cross-shop/install.sh        # symlinks into ~/.claude/skills/
```

Or manually:
```bash
cp -r skills/cross-shop ~/.claude/skills/
cd ~/.claude/skills/cross-shop && npm install
```

### Option 2 — Claude Code plugin (marketplace-installable)

```json
{
  "name": "cross-shop",
  "source": { "source": "github", "repo": "to-nexus/skill-cross-shop" },
  "category": "blockchain"
}
```

---

## Activation

Activate when the user wants to:

- **List** the supported game shops (currently `rohan2`, `seal-m`, `rom`) and their adapter completeness
- **Browse** the product catalog of one game shop
- **Authenticate** with a per-player Game UUID and (optionally) persist the session locally
- **Quote** a purchase by `(game, productId, payment rail)`
- **Execute** a purchase end-to-end on `--pay CROSS` or `--pay BNB`
- **Read** order history for the resolved session
- **Poll** a single order to terminal delivery state

Inside Claude Code, just describe the action in plain language. The skill activates on phrases like:
- "cross.shop 게임 목록"
- "rohan2 샵에서 살 수 있는 패키지 목록 보여줘"
- "seal-m 샵의 weekly costume 상품 BNB로 사줘"
- "ROM 게임 상품 CROSS로 결제해"
- "list available games on cross.shop"
- "buy seal-m package with CROSS"
- "show my cross.shop order history for rohan2"

Direct CLI:
```bash
cd ~/.claude/skills/cross-shop
node scripts/games.mjs                                                   # works today
node scripts/products.mjs rohan2                                         # needs Phase 1
PRIVATE_KEY=0x... node scripts/login.mjs rohan2 --uuid <UUID> --persist  # needs Phase 1
node scripts/quote.mjs rohan2 <productId> --pay CROSS                    # needs Phase 1
PRIVATE_KEY=0x... node scripts/purchase.mjs rohan2 <productId> --pay CROSS --confirm
                                                                         # needs Phase 1
node scripts/orders.mjs rohan2                                           # needs Phase 1
node scripts/status.mjs rohan2 <orderId>                                 # needs Phase 1
```

All commands emit a single JSON object on stdout.

---

## Prerequisites

- Node ≥ 20 (`node --version`)
- Deps installed: `cd ~/.claude/skills/cross-shop && npm install`
- For `login` / `purchase` / `orders`: a wallet `.env` (see Configuration)
- For everything except `games`: a populated `references/games.json` (see `references/cross-shop.md`)

---

## Configuration

```bash
cp skills/cross-shop/.env.example skills/cross-shop/.env
chmod 600 skills/cross-shop/.env
```

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PRIVATE_KEY` | for `login` / `purchase` / `orders` | — | EOA signer, `0x` + 64 hex chars |
| `WALLET_ADDRESS` | optional | derived from PK | Mismatch warns via `signerWarn` |
| `CROSS_RPC_URL` | optional | in-registry default | Override if you have a private RPC |
| `BSC_RPC_URL` | optional | in-registry default | Override if you have a private RPC |
| `MAX_PURCHASE_NOTIONAL` | recommended | `100` | Per-purchase USD cap; aborts above this |
| `CONFIRM_THRESHOLD` | recommended | `10` | Purchases above this USD threshold require `--confirm` |
| `MIN_GAS_NATIVE` | optional | `0.001` | Payment-chain native floor; set `0` to skip |
| `RECEIPT_TIMEOUT` | optional | `120` | Seconds to poll delivery after on-chain confirm |
| `GAME_UUID_<SLUG>` | optional | — | Per-game UUID source for `login.mjs` (treated as credential) |

---

## Credential resolution

Two distinct credentials:

- **`PRIVATE_KEY`**: env → `./.env` → `~/.claude/skills/cross-shop/.env` → ask user. Validated against `^0x[0-9a-fA-F]{64}$`. Never echoed to transcript.
- **Game UUID**: `--uuid` flag → `GAME_UUID_<SLUG>` env → ask user. Held in process memory only; persisted at rest as `sha256(uuid)` in the per-game session file.
- **Session token**: written to `~/.claude/skills/cross-shop/.sessions/<game>.json` mode `0600` when `login.mjs --persist` is used. Loaded by subsequent auth-required calls; uid-checked.

---

## Safety rails

The skill enforces these rails on every write op via `_guard.mjs`:

1. **Payment-chain id check** — `--pay CROSS` ⇒ chain `612055`; `--pay BNB` ⇒ chain `56`. Aborts on mismatch.
2. **`MAX_PURCHASE_NOTIONAL`** — env USD cap; aborts when `priceUsd` exceeds it.
3. **`CONFIRM_THRESHOLD` + `--confirm` gate** — any purchase above this USD threshold aborts with `awaiting_confirm` (exit 2) unless `--confirm` is passed.
4. **`MIN_GAS_NATIVE` pre-flight** — aborts if payment-chain native balance < this floor.
5. **Game existence guard** — `unknown_game` if slug not in `references/games.json`.
6. **Product existence guard** — `unknown_product` if `productId` not in latest products response.
7. **Fresh-quote binding** — refuses to sign with a stale `paymentTarget`.
8. **Receipt-after-payment polling** — if back-end hasn't delivered within `RECEIPT_TIMEOUT`, returns `{ok:true, deliveryStatus:"pending", txHash, orderId}` with explorer link (never `ok:false`).
9. **`unsupported_rail_v0_1`** — `--pay CARD` aborts with hint to finish in browser (deferred to v0.2).
10. **Phase-1 capture guard** — every subcommand whose registry slot is `null` aborts with `phase_1_not_captured` (exit 3) instead of fabricating a fake call.
11. **`WALLET_ADDRESS` mismatch warning** — non-null `signerWarn` when env disagrees with PK-derived address.

The private key never appears in the Claude transcript unless the user pastes it in directly. Even then it's passed via `process.env` to the spawned `node`, never echoed back. Game UUIDs are treated identically.

---

## Subcommands

| Subcommand | Status today | After Phase 1 |
|---|---|---|
| `games` | works | works |
| `products <game>` | `phase_1_not_captured` | fetches catalog |
| `login <game> --uuid <UUID> [--persist]` | `phase_1_not_captured` | exchanges UUID for session |
| `quote <game> <productId> --pay <rail>` | `phase_1_not_captured` | back-end quote, no signing |
| `purchase <game> <productId> --pay <rail> [--confirm]` | `phase_1_not_captured` (or `unsupported_rail_v0_1` for CARD) | full flow |
| `orders <game> [--limit N]` | `phase_1_not_captured` | reads order history |
| `status <game> <orderId> [--watch <sec>]` | `phase_1_not_captured` | polls single order |

Exit codes: `0` success, `1` runtime error, `2` user error (bad args / awaiting_confirm / unknown_game / unknown_product / unsupported_rail_v0_1), `3` `phase_1_not_captured`.

---

## Layout

```
skill-cross-shop/                     # repo root = plugin
├── .claude-plugin/plugin.json        # plugin manifest
├── install.sh                        # symlink installer
├── README.md
├── LICENSE
└── skills/
    └── cross-shop/                   # the skill itself
        ├── SKILL.md
        ├── package.json
        ├── .env.example
        ├── scripts/
        │   ├── _api.mjs              # per-game shopFetch wrapper, snake↔camel
        │   ├── _registry.mjs         # loads references/games.json, requireSlot()
        │   ├── _session.mjs          # ~/.claude/skills/cross-shop/.sessions/, sha256(uuid)
        │   ├── _chain.mjs            # rail→chainId, RPC resolution, ensureChainId
        │   ├── _signer.mjs           # PK validation, walletClient factory
        │   ├── _guard.mjs            # chain / gas / cap / confirm / product gates
        │   ├── games.mjs             # works today (registry dump)
        │   ├── products.mjs          # stub: phase_1_not_captured
        │   ├── login.mjs             # stub: phase_1_not_captured
        │   ├── quote.mjs             # stub: phase_1_not_captured
        │   ├── purchase.mjs          # stub: phase_1_not_captured (or unsupported_rail_v0_1)
        │   ├── orders.mjs            # stub: phase_1_not_captured
        │   └── status.mjs            # stub: phase_1_not_captured
        └── references/
            ├── games.json            # per-game adapter registry (all slots null on skeleton)
            └── cross-shop.md         # Phase-1 capture playbook
```

---

## References

- `skills/cross-shop/references/cross-shop.md` — Phase-1 capture playbook (read this to fill in `games.json`)
- `skills/cross-shop/references/games.json` — per-game adapter registry
- `docs/PLAN-skill-cross-shop.md`, `docs/REQUIREMENTS-skill-cross-shop.md`, `docs/RISKS-skill-cross-shop.md` — design provenance
- `CONTEXT.md` — domain glossary (`cross.shop`, `game shop`, `payment rail`, `payment escrow`, `Game UUID`, `orderId`, `delivery status`)

---

## License

[MIT](LICENSE) — but read the disclaimer at the bottom of the LICENSE file before using.
