FROM node:22.22.1-alpine3.23@sha256:8094c002d08262dba12645a3b4a15cd6cd627d30bc782f53229a2ec13ee22a00

ENV NODE_ENV=production \
    SUT_HOST=0.0.0.0 \
    SUT_PORT=4173

WORKDIR /app

COPY --chown=node:node server.mjs ./server.mjs

USER node

EXPOSE 4173

HEALTHCHECK --interval=2s --timeout=2s --start-period=2s --retries=10 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4173/health').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server.mjs"]
