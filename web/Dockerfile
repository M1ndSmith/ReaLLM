FROM node:22-bookworm-slim AS build

WORKDIR /src

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./

ARG NEXT_PUBLIC_GATEWAY_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL

RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app

RUN adduser --disabled-password --gecos "" --uid 1000 realmm

ENV NODE_ENV=production
ENV NEXT_PUBLIC_GATEWAY_URL=http://127.0.0.1:8000

COPY --from=build /src/package.json /src/package-lock.json ./
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/.next ./.next
COPY --from=build /src/next.config.ts ./
COPY --from=build /src/tsconfig.json ./

RUN chown -R realmm:realmm /app

USER realmm

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
