FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL은 런타임에 주입되지만 Next.js 빌드 시 server-component가 db/client를 정적으로 import하므로 더미 값 필요
ARG DATABASE_URL=postgres://build:build@localhost:5432/build
ENV DATABASE_URL=${DATABASE_URL}
RUN npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV TZ=Asia/Seoul
# Bind on all interfaces — Docker otherwise sets HOSTNAME to the container id, which Next standalone picks up and binds only to its db_shared IP
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN apk add --no-cache tzdata
# Standalone 번들 + 정적 자산
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# 마이그레이션·인제스천 CLI가 쓰는 코드
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server ./server
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
# Next standalone 트레이서가 drizzle-orm처럼 동적 경로를 일부 누락하는 경우가 있어 prod 의존성을 한 번 더 보강
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --omit=optional --prefer-offline --no-audit
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
