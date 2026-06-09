# ── Stage 1: Build ──────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

# ── Stage 2: Run ────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "dist/index.js"]
