# Alpaca Live Package

This is the clearer handoff folder for Alpaca.

## What is inside

- adapter
- routes
- encrypted secret storage
- OAuth start / code exchange / refresh
- frontend Accounts-tab helpers

## Most important files

- `README.md`
- `alpaca-adapter.ts`
- `alpaca-config.ts`
- `api/`
- `frontend/alpaca-connect-flow.ts`

## What still needs to happen in a real app

1. mount the `/broker/...` routes in your real backend
2. set env vars
3. wire the Accounts tab buttons to the frontend helper
4. test with real Alpaca paper, then live

## Note

This package is already the most complete one. Alpaca is the furthest along.
