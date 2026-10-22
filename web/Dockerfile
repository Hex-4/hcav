FROM oven/bun:1.4.2 AS build
WORKDIR /app
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
ARG APP_ORIGIN=https://hcav.hackclub.community
RUN bun run build \
    && rm -rf node_modules \
    && bun install --production --frozen-lockfile --ignore-scripts

FROM oven/bun:1.4.2-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    APP_ORIGIN=https://hcav.hackclub.community \
    SQLITE_PATH=/data/hcav.sqlite \
    BODY_SIZE_LIMIT=16K
WORKDIR /app
COPY --from=build --chown=bun:bun /app/build ./build
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/package.json ./package.json
COPY scripts/container-start.mjs ./scripts/container-start.mjs
USER root
RUN mkdir /data && chown bun:bun /data
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://127.0.0.1:3000/').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"
CMD ["bun", "./scripts/container-start.mjs"]
