---
type: Operations
title: Wallet Billing
description: Billing modes, Arc testnet USDC prepaid balance, feature line items, reconcile, and spend denial.
tags: [billing, wallet, usdc, arc]
verified:
  - by: openwiki/0.5.2
    at: 2026-10-07T02:38:11.806Z
sources:
  - id: openwiki-source-97f23ee253be8b8aa9a32597
    resource: repo://app/api/errors.py
  - id: openwiki-source-5d48bc9a089bafc94bb311da
    resource: repo://app/application/billing.py
  - id: openwiki-source-7f095bff989340788ccf4345
    resource: repo://app/infrastructure/arc_usdc.py
  - id: openwiki-source-f780dc464f461dbeccc1de10
    resource: repo://app/infrastructure/arc_wallet.py
  - id: openwiki-source-f7633ed29cf3ca84a9f99f48
    resource: repo://app/infrastructure/billing_gateway.py
  - id: openwiki-source-3a3d1241c76dff24f4f7a682
    resource: repo://app/infrastructure/billing_store.py
  - id: openwiki-source-db0ec04dc9c2d403e1b7614e
    resource: repo://app/settings.py
  - id: openwiki-source-c0159de4398b69b176680e62
    resource: repo://config/realmm.yaml
generated: { by: "cursor", at: "2026-10-07T02:38:11.806Z" }
---

# Wallet Billing

`config/realmm.yaml` sets `billing.mode` to `wallet`. The code default is `off`. `off` uses `NoopBilling`. Any other mode uses `BillingStore`. `hybrid` and `wallet` enforce spend checks. `shadow` records without enforcing. See [System Architecture](../architecture/system.md) and [Configuration and Runtime Flags](configuration.md).

## Wallet balance

Wallet mode loads or creates `data/arc-wallet.json`. A new file is written with mode `0600` and holds the secp256k1 private key. That file stays under gitignored `data/`. The public deposit address is `wallet_address` on `GET /billing/status`.

The YAML preset uses Arc Testnet chain id `5042002`, RPC `https://rpc.testnet.arc.io`, and USDC `0x3600000000000000000000000000000000000000`. `ArcUsdcReader.balance_usdc` calls `eth_call` with the ERC-20 `balanceOf` selector and divides the raw units by `1000000`. A failed RPC raises `BillingUnavailableError`, which the API maps to HTTP 503. It does not grant credit.

Available USDC for `billing.funded_team_id` (YAML default `operator`) is the on-chain balance minus that team's `lifetime_settled_usdc`. An identity with no `team_id` draws that funded team in wallet mode. An identity with its own `team_id` keeps that ledger row, and chain sync does not overwrite it.

Wallet mode always requires prepaid balance, even when a quota sets `prepaid_required` false. Other modes use the quota flag, then `billing.prepaid_required`.

When the stored ledger day is not the current UTC day, `spent_usd` resets to `0` and `balance_usdc` plus `lifetime_settled_usdc` are kept. A faucet deposit is not spendable again just because the day rolled: the next chain read still subtracts lifetime settled USDC.

The Circle faucet URL on status is `https://faucet.circle.com`.

## Holds and line items

`BillingCoordinator.pre_authorize` checks the estimate, then holds it. The idempotency key is `bill:` plus the first 32 hex characters of SHA-256 over `identity|request|route|turn`. A repeated key returns the existing hold. A zero estimate does not create a hold.

Settlement adds `spent_usd`. Outside shadow mode it also subtracts `balance_usdc` and adds `lifetime_settled_usdc`. A second settle with the same key returns without charging again. Chat adds feature line items for the layers that ran. See [Chat Pipeline](../architecture/chat-pipeline.md) and [Optional Pipeline Layers](../integrations/optional-layers.md).

## Routes

`GET /billing/status` and `GET /billing/usage` require `read`. Team policy reads and patches, and `POST /billing/reconcile`, require `admin`.

In wallet mode the gateway mode is `arc`. Reconcile calls `refresh_chain_balance` and returns detail `Arc USDC available {amount:.6f}.` Ledger mode returns `Ledger-authoritative reconciliation.` A team-policy patch can write `balance_usdc`, and the next chain read replaces the funded team's balance with on-chain minus lifetime settled.

`BudgetExceededError` is HTTP 402. That covers the team daily cap, the per-call cap, and insufficient prepaid balance, including a shortfall discovered at settlement.

The console rail reads this status. See [Operator Console](../console/operator-ui.md).
