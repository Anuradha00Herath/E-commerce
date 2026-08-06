# Project: Trusted Multi-Vendor Marketplace (Sri Lanka)

## What this is
A multi-vendor e-commerce marketplace (like Daraz, but focused on trust and UX). Solo developer.

## Stack
- Backend/commerce engine: Medusa v2 + Mercur marketplace starter (TypeScript, Node)
- Storefront: Next.js (React, TypeScript)
- Database: PostgreSQL   |   Cache/sessions: Redis
- Repo layout: monorepo with /backend and /storefront

## Current sprint: Sprint 1 — "walking skeleton"
Goal: backend (admin + vendor dashboard) and storefront running locally AND deployed to staging,
where a seeded vendor's product is visible on the storefront and a buyer can register and log in.
NOT in this sprint: payments, search (Meilisearch), reviews, returns, honest-pricing.

## Working rules for the agent
- Prefer official Medusa v2 and Mercur docs for exact commands; don't invent version-specific flags.
- Make small, reviewable changes. Explain what you're about to do before running commands.
- Always ask before deleting files, dropping databases, or any destructive/irreversible action.
- Never commit secrets. Keep all keys in .env files and ensure .env is in .gitignore.
- After a step works, suggest a clear git commit message.
- If a command fails, show me the error and propose a fix before retrying.
