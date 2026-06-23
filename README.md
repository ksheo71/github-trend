# GitHub Trend

매일 새벽 GHArchive와 GitHub REST API에서 어제분 활동을 수집·집계해 보여주는 공개 트렌드 대시보드.

- 사이트: https://github-trend.myazit.kr
- 디자인: [`docs/superpowers/specs/2026-06-23-github-trend-design.md`](docs/superpowers/specs/2026-06-23-github-trend-design.md)
- 구현 플랜: [`docs/superpowers/plans/2026-06-23-github-trend.md`](docs/superpowers/plans/2026-06-23-github-trend.md)

## 로컬 개발

```bash
cp .env.example .env   # DATABASE_URL, GITHUB_TOKEN 채우기
npm install
npm run migrate
npm run dev            # http://localhost:3000
```

수동 ingest (예: 어제):
```bash
npm run ingest -- --day 2026-06-22
```

## 테스트

Docker가 켜져 있어야 합니다 (Testcontainers).

```bash
npm test
```

## 운영 (Mac mini)

전제: 공용 Postgres가 `shared_pg` docker network에, Caddy가 `caddy_net` docker network에 이미 떠 있음. Cloudflare Tunnel이 `*.myazit.kr → Caddy`로 라우팅 중.

1. 공용 Postgres에서 한 번:
   ```sql
   CREATE SCHEMA IF NOT EXISTS gh_trend;
   ```

2. `.env`를 같은 폴더에 두고:
   ```bash
   docker compose up -d --build
   ```

3. Caddy에 블록 추가 후 reload:
   ```caddy
   github-trend.myazit.kr {
       reverse_proxy github-trend-app:3000
   }
   ```

4. 첫 데이터 수집 (수동 1회):
   ```bash
   docker compose exec app node --experimental-strip-types scripts/ingest.ts --day 2026-06-22
   ```

5. 이후 매일 04:00 KST 자동 실행. 상태 확인:
   ```sql
   SELECT day, status, started_at, finished_at FROM gh_trend.ingest_runs ORDER BY id DESC LIMIT 5;
   ```

## 환경변수

| 키 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:pw@host:5432/db` (공용 Postgres) |
| `GITHUB_TOKEN` | yes | `public_repo` 권한 PAT |
| `DISCORD_WEBHOOK_URL` | no | 배치 실패 알림. 없으면 콘솔만 |
| `LOG_LEVEL` | no | `info`(기본) / `debug` / `warn` 등 |
| `TZ` | yes | `Asia/Seoul` — node-cron이 KST로 해석하도록 |
