FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL은 런타임에 주입되지만 Next.js 빌드 시 API route 정적 분석을 통과시키기 위해 더미 값 사용
ARG DATABASE_URL=postgres://build:build@localhost:5432/build
ENV DATABASE_URL=${DATABASE_URL}
RUN npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV TZ=Asia/Seoul
WORKDIR /app
RUN apk add --no-cache tzdata
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server ./server
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/package.json ./package.json
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
