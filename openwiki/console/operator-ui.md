---
type: Operator console
title: Operator Console
description: The Next.js console chats through the gateway, stores the gateway key in session storage, and does not send a shared memory user id.
tags: [console, nextjs, playground, settings]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-22T20:59:37.438Z
sources:
  - id: openwiki-source-e201e686a785f09b6d899f0b
    resource: repo://compose.yaml
  - id: openwiki-source-109c9cf01457963940c651df
    resource: repo://web/app/connect/page.tsx
  - id: openwiki-source-1ddcf87deadae670da72b991
    resource: repo://web/app/page.tsx
  - id: openwiki-source-ec163e475f3d36294437ee03
    resource: repo://web/app/settings/page.tsx
  - id: openwiki-source-7508529c36c13e1e94c1b201
    resource: repo://web/hooks/useChatSession.ts
  - id: openwiki-source-52efea8a30415c42de580369
    resource: repo://web/lib/auth.ts
  - id: openwiki-source-8bc4a1b8ad7b8c58f8ec316b
    resource: repo://web/lib/gateway.ts
generated: { by: "cursor", at: "2026-09-22T20:59:37.438Z" }
---

# Operator Console

The console is a Next.js app. `/` is the playground, `/connect` copies client snippets, and `/settings` toggles runtime layers and, with an admin key, manages gateway keys. Each page renders `Console` with a different `view`.

The browser calls `NEXT_PUBLIC_GATEWAY_URL`, defaulting to `http://127.0.0.1:8000`. Compose publishes the console on `127.0.0.1:3000` and sets gateway CORS to `http://localhost:3000` and `http://127.0.0.1:3000`.

## Playground

`useChatSession` keeps the transcript in React state and resends that list on each turn. The chat body includes `model`, `messages`, `stream: true`, and `conversation_id`. The conversation id is a UUID in `sessionStorage`. The body does not include `user_id`. Memory scope is the gateway key that authenticates the request. New chat replaces the conversation id and clears the React transcript. It does not partition long-term facts.

A pasted gateway key is stored under `realmm.gateway_key` in `sessionStorage` and sent as `Authorization`. The console does not write that key, or provider keys, into `.env`.

## Connect and Settings

Connect snippets may still show `user_id` as an example field. That field is trace metadata on the gateway. It is not the Mem0 tenant.

Settings patches `/config` for memory, PII, and guard flags. Those writes land in `data/runtime-flags.json` on the gateway process. The page tells the operator to set `GATEWAY_API_KEY` in `.env` and restart before layer toggles work. See [Gateway Authentication](../api/authentication.md).
