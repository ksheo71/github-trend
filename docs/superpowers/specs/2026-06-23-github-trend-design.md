# GitHub Trend — Design Spec

- **Domain**: https://github-trend.myazit.kr
- **Date**: 2026-06-23
- **Status**: Approved for planning

## 1. 목적과 범위

최근 GitHub에 올라오는 레포지토리를 매일 수집·집계하여, 어떤 언어/키워드/레포가 뜨고 있는지 한눈에 보여주는 공개 트렌드 대시보드.

**MVP 범위**
- 공개 사이트, 로그인 없음
- 분석 축 3가지: 언어별 트렌드 / 키워드·기술 추세 / 스타 증가율 기준 급상승 레포
- 기간 필터: 일 / 주 / 월
- 정렬 옵션: 스타 / 증가율 / 포크 / 이슈
- 데이터는 하루 1회 새벽 갱신

**범위 밖 (의도적)**
- 사용자 계정·구독·알림
- AI 카테고리화 (topics 시그널로 충분)
- 검색·북마크·공유 카드
- 다국어 (한국어 1언어)

## 2. 전체 아키텍처

단일 Next.js 컨테이너에 페이지·API·백그라운드 cron 워커를 모두 담는다. 공용 Postgres가 별도 컨테이너로 동작 중이며 같은 docker network로 접근한다.

```
[ data.gharchive.org ] ── 시간별 .json.gz ──┐
[ api.github.com    ] ── REST 보강 ─────────┤
                                            ▼
┌──────────── Next.js 컨테이너 (Mac mini, Docker) ───────────┐
│  app/         페이지 (SSR)                                  │
│  app/api/    JSON API                                       │
│  server/cron/ node-cron 워커 (앱 부팅 시 등록)              │
│  server/ingest/  GHArchive 파서 + GitHub REST 클라이언트    │
│  server/analyze/ 트렌드 집계 SQL                            │
│  server/db/     Drizzle (마이그레이션 + 쿼리)              │
└─────────────────────┬───────────────────────────────────────┘
                      │
              [ 공용 Postgres (gh_trend 스키마) ]
                      ▲
                      │ HTTPS
        [ Cloudflare Tunnel: *.myazit.kr → Caddy ]
                      │
              [ Caddy: github-trend.myazit.kr → github-trend-app:3000 ]
```

**핵심 단순화**
- 큐·외부 워커 없음. cron이 호출하는 `runDailyIngest()` 함수 하나
- 페이지는 절대 GitHub API를 직접 호출하지 않음 (rate limit 격리)
- 모든 시간은 UTC 저장, 표시 시점에서만 KST 변환

## 3. 데이터 모델

모든 테이블은 `gh_trend` 스키마 하위. Drizzle ORM으로 정의.

### 3.1 원천 데이터

**`gh_trend.repos`** — 관측한 모든 레포의 메타데이터 캐시
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint PK | GitHub repo id (영구 불변) |
| full_name | text not null | "owner/name", unique index |
| description | text | |
| language | text | GitHub의 주 언어 |
| topics | text[] | 트렌드 키워드의 원천 |
| homepage | text | |
| license | text | |
| stars | int | 최신 관측치 캐시 |
| forks | int | |
| open_issues | int | |
| created_at | timestamptz | 레포 자체 생성 시각 |
| pushed_at | timestamptz | |
| fetched_at | timestamptz | REST API 마지막 보강 시각 |

**`gh_trend.repo_daily_stats`** — 레포별 일자별 시계열, 증가율 계산 기반
| 컬럼 | 타입 | 비고 |
|---|---|---|
| repo_id | bigint → repos.id | |
| day | date | UTC 자정 기준 |
| stars | int | 그날 끝 시점의 누적 스타 |
| forks | int | |
| watchers | int | |
| stars_delta | int | 전날 대비, 배치에서 계산 |
| PK | (repo_id, day) | |

**`gh_trend.events_daily`** — GHArchive 어제분 이벤트 집계 (원본 JSON은 저장하지 않음)
| 컬럼 | 타입 |
|---|---|
| day | date |
| repo_id | bigint |
| watch_events | int |
| fork_events | int |
| push_events | int |
| pr_events | int |
| issue_events | int |
| PK | (day, repo_id) |

### 3.2 머티리얼라이즈드 집계 (페이지가 읽는 곳)

**`gh_trend.trend_repo`** — 핫 레포 랭킹
| 컬럼 | 타입 |
|---|---|
| period | text — 'day' \| 'week' \| 'month' |
| language | text — 'ALL' 포함 |
| repo_id | bigint |
| star_gain | int — 기간 내 증가량 |
| rank_by_star_gain | int |
| rank_by_stars | int |
| PK | (period, language, repo_id) |

**`gh_trend.trend_keyword`** — 키워드 추세
| 컬럼 | 타입 |
|---|---|
| period | text |
| keyword | text |
| mentions | int — 해당 키워드를 가진 핫 레포 수 |
| delta_pct | numeric — 직전 동일 기간 대비 변화율 |
| sample_repo_ids | bigint[] — 카드 미리보기용 상위 5개 |
| PK | (period, keyword) |

**`gh_trend.trend_language`** — 언어 점유율
| 컬럼 | 타입 |
|---|---|
| period | text |
| language | text |
| hot_repo_count | int |
| total_stars_gained | bigint |
| PK | (period, language) |

### 3.3 운영

**`gh_trend.ingest_runs`** — 배치 실행 로그
| 컬럼 | 타입 |
|---|---|
| id | bigserial PK |
| started_at | timestamptz |
| finished_at | timestamptz |
| status | text — 'running' \| 'success' \| 'failed' |
| stats | jsonb |
| error | text |

### 3.4 설계 포인트

- **PK로 GitHub repo id 사용**: full_name은 리네임될 수 있어 부적합
- **시계열은 일 단위만**: 트렌드 표현에 충분, 시간 단위는 30배 양
- **JSON 원본 미보관**: GHArchive 원본은 일 1~5GB, 스트리밍 파싱 후 폐기
- **머티리얼라이즈드 테이블 = 일반 테이블 + TRUNCATE/INSERT**: PostgreSQL MATERIALIZED VIEW의 REFRESH 락 이슈 회피, 인덱스/외래키 자유
- **35일 보존**: `repo_daily_stats`/`events_daily`는 35일 후 DELETE (월간 트렌드 + 5일 안전 마진)

## 4. 데일리 인제스천 파이프라인

**진입점**: `server/cron/daily.ts`가 node-cron으로 매일 04:00 KST에 `runDailyIngest(targetDay)` 호출. `targetDay`는 항상 "어제 UTC 날짜" (GHArchive 1시간 지연 마진).

### 단계별

1. **잠금 확보** — `ingest_runs` 'running' INSERT. 같은 day로 'success' 이미 있으면 종료(멱등). 1시간 이상 좀비 'running'은 무시.
2. **GHArchive 스트리밍 파싱** — `https://data.gharchive.org/{YYYY-MM-DD}-{H}.json.gz` 24개를 동시 4개씩, `fetch → gunzip → ndjson parse`. 메모리에서 레포별 카운터 Map 유지, 파일 끝나면 `events_daily`에 upsert. 관심 이벤트: WatchEvent / ForkEvent / PushEvent / PullRequestEvent / IssuesEvent. 신규 repo는 id+full_name placeholder로 `repos`에 INSERT.
3. **핫 레포 후보 선정** — `events_daily.watch_events ≥ 10` OR 신규 레포 OR 직전 `trend_repo`에 있던 레포. 500~3,000개 수준.
4. **GitHub REST 보강** — 후보 레포에 `GET /repos/{owner}/{name}`. 동시 5, 200ms 간격. PAT 1개 사용. 응답으로 `repos` 갱신, `fetched_at = now()`. 404/private 전환은 stars=null로 마킹 후 제외. Rate limit 잔여 100 미만이면 reset까지 sleep.
5. **일 단위 스냅샷 적재** — 보강된 후보에 대해 `repo_daily_stats(day=어제)` upsert. `stars_delta = 오늘 stars − 어제 행 stars`. 어제 행 없으면 NULL(신규 관측).
6. **트렌드 집계** — 단일 트랜잭션에서 `trend_repo`/`trend_keyword`/`trend_language` 3개 테이블 TRUNCATE & INSERT.
7. **보존 정책** — `repo_daily_stats`/`events_daily`에서 day < now() − 35일 DELETE. `ingest_runs` 30일 이상 DELETE.
8. **완료 마킹** — `ingest_runs.status='success'`, `stats` JSON에 처리 통계.

### 실패 처리

- 단계별 try/catch, 실패 시 `ingest_runs.status='failed'`. 다음날 04:00에 자동 재시도.
- 수동 재실행: `npm run ingest -- --day 2026-06-22`
- 일시적 네트워크 오류: 파일 단위로 3회 재시도(지수 백오프)

### 자원 추정

- GHArchive 24개 파일 ≈ 압축 1.5GB / 압축 해제 후 20GB (스트리밍이라 디스크 사용 0)
- 다운로드 30~60분 + GitHub API 5~10분 = **총 40~70분**. 04:00 시작이면 05:10 무렵 완료.

## 5. 분석 로직

### 5.1 핫 레포 랭킹 (`trend_repo`)

"증가율" 정의는 절대 스타 증가량(`star_gain`). 백분율은 분모가 작은 신생 레포에서 노이즈가 너무 큼.

```sql
-- 'day' 예시
WITH gained AS (
  SELECT repo_id, stars_delta AS star_gain
  FROM gh_trend.repo_daily_stats
  WHERE day = :yesterday AND stars_delta > 0
),
joined AS (
  SELECT r.id, r.language, g.star_gain, r.stars
  FROM gained g JOIN gh_trend.repos r ON r.id = g.repo_id
  WHERE r.stars IS NOT NULL
)
INSERT INTO gh_trend.trend_repo
  (period, language, repo_id, star_gain, rank_by_star_gain, rank_by_stars)
SELECT 'day', 'ALL', id, star_gain,
       ROW_NUMBER() OVER (ORDER BY star_gain DESC, stars DESC),
       ROW_NUMBER() OVER (ORDER BY stars DESC)
FROM joined
ORDER BY star_gain DESC
LIMIT 100;
```

- 'week'/'month'는 7일/30일 합산 (`SUM(stars_delta)`)
- 언어별: 같은 쿼리를 `WHERE language=:lang`으로. 'ALL' + 상위 10개 언어
- 신규(어제 첫 관측) 레포는 `stars_delta = NULL`이라 자동 제외

### 5.2 키워드 추세 (`trend_keyword`)

**원천**: `repos.topics`만 사용. description 토큰화는 노이즈 크고 다국어 토크나이저 필요해 미적용.

**스탑워드**: `awesome`, `tutorial`, `learning`, `example`, `boilerplate`, `template`, `starter` + 언어명(python/javascript/typescript/rust/go/cpp/…). 코드 상수로 관리.

**알고리즘**:
1. period별 핫 후보 = `trend_repo` (period, 'ALL') 상위 200개
2. 후보의 topics 평탄화 → 빈도 카운트
3. 직전 동일 기간 결과와 비교, `delta_pct = (now − prev) / max(1, prev) × 100`
4. `mentions ≥ 3 AND delta_pct ≥ 10%`만 INSERT
5. `sample_repo_ids` = 해당 키워드 보유 후보 중 star_gain 상위 5

### 5.3 언어 점유율 (`trend_language`)

period별 `trend_repo` (period, 'ALL') 상위 100을 모집단으로 `GROUP BY language` 집계.

### 5.4 트랜잭션

3개 테이블 갱신은 단일 트랜잭션으로. 중간 실패해도 직전 상태 유지, 페이지에 깨진 데이터 노출 없음.

### 5.5 의도적 단순화

- AI 카테고리화·유사 레포 클러스터링·시간 가중치 없음 (YAGNI)
- 봇/스팸 휴리스틱은 운영하며 케이스 보고 추가

## 6. 웹 화면 & API

### 6.1 라우트

```
app/
  layout.tsx                  공통 다크 테마
  page.tsx                    메인 대시보드
  trending/page.tsx           풀 랭킹 (100개)
  keyword/[name]/page.tsx     특정 키워드 상세
  repo/[id]/page.tsx          레포 상세 (스타 시계열)
  api/
    trending/route.ts         GET ?period=&lang=&sort=
    keywords/route.ts
    languages/route.ts
    repo/[id]/route.ts        시계열 JSON
```

모든 페이지는 서버 컴포넌트로 SSR, Drizzle 직접 쿼리.

### 6.2 메인 대시보드 레이아웃

상단: 기간 탭(day/week/month). 본문: 좌 — 언어 점유 도넛 + 막대, 우 — 뜨는 키워드 카드. 하단: 핫 레포 25개 카드 리스트 (정렬·언어 드롭다운). 푸터: 마지막 배치 시각.

레포 카드: 풀네임, 설명, 언어 배지, topics 칩, 현재 스타와 기간 증가량, mini sparkline.

정렬·언어 변경은 URL 쿼리(`?period=&lang=&sort=`)로 → 서버 재렌더. JS 없이도 동작.

### 6.3 캐시

- `revalidate = 600` (10분). 하루 1회만 데이터 변하지만 단순하게.
- 새벽 배치 후 능동 무효화 안 함.

### 6.4 스타일

- shadcn/ui + Tailwind, 다크 모드 기본
- 폰트: Geist Sans / Geist Mono (Next.js 기본)
- 색상 토큰: zinc 베이스 + 액센트 1색 (구현 시 시안 보고 결정)

### 6.5 차트

- Recharts (Next.js 호환성·다크 테마 OK)

## 7. 운영·관측성·테스트

### 7.1 에러 처리·알림

- 배치 단계별 try/catch, 실패 시 `ingest_runs.status='failed'` + 스택 저장
- 실패 알림: Discord 웹훅 1개 (`DISCORD_WEBHOOK_URL`, 미설정 시 콘솔만)
- 웹 측: Next.js 기본 `error.tsx`로 폴백, "마지막 성공 시각" 표시. 배치 36시간 이상 지연 시 경고 배지.

### 7.2 로그

- pino JSON, `LOG_LEVEL` env, Docker stdout
- 단계별 구조화: `{stage, day, files_done, repos_touched}`

### 7.3 테스트

**유닛 (Vitest)**
- GHArchive 이벤트 파서
- 키워드 정규화·스탑워드
- 시간대 변환 (UTC ↔ KST, "어제 UTC 날짜")
- 트렌드 SQL 빌더

**통합 (Vitest + Testcontainers Postgres)**
- 픽스처로 `events_daily`/`repo_daily_stats` 채우고 `runDailyAggregation()` 호출 → `trend_*` 검증
- GitHub API·GHArchive HTTP는 MSW 모킹

**E2E 없음** — 페이지가 단순한 데이터 표시라 비용 대비 가치 낮음.

## 8. 디렉토리 구조

```
github-trend/
├─ app/                      Next.js 페이지·API
├─ components/               shadcn 기반 UI
│  └─ ui/                    생성된 shadcn 컴포넌트
├─ server/
│  ├─ db/                    Drizzle 스키마/쿼리
│  ├─ ingest/                GHArchive + GitHub REST
│  ├─ analyze/               트렌드 집계 SQL
│  ├─ cron/                  node-cron 등록 + daily 진입점
│  └─ logger.ts              pino
├─ scripts/
│  ├─ ingest.ts              CLI: npm run ingest -- --day YYYY-MM-DD
│  └─ migrate.ts
├─ db/migrations/            Drizzle 마이그레이션 SQL
├─ tests/
│  ├─ unit/
│  └─ integration/
├─ docker/
│  ├─ Dockerfile             multi-stage (deps → build → runner)
│  └─ entrypoint.sh          migrate 후 next start
├─ docker-compose.yml
├─ drizzle.config.ts
├─ next.config.ts
├─ package.json
├─ .env.example
└─ README.md
```

## 9. 배포

**라우팅 체인**
```
*.myazit.kr → Cloudflare Tunnel → 사용자 Caddy → github-trend-app:3000
```

**Caddyfile 추가**
```caddy
github-trend.myazit.kr {
    reverse_proxy github-trend-app:3000
}
```

**docker-compose.yml**
```yaml
services:
  app:
    container_name: github-trend-app
    build: .
    env_file: .env
    networks: [shared_pg, caddy_net]
    restart: unless-stopped
networks:
  shared_pg:  { external: true }
  caddy_net:  { external: true }
```

호스트 포트 노출 없음. 컨테이너명으로 Caddy가 접근.

**Dockerfile**: `node:22-alpine` multi-stage. 부팅 시 `entrypoint.sh`가 `drizzle migrate` 실행 후 `next start`. 앱 부팅 코드가 node-cron 작업을 자동 등록.

**환경변수 (.env)**
```
DATABASE_URL=postgres://...gh_trend...
GITHUB_TOKEN=ghp_...
DISCORD_WEBHOOK_URL=         # 선택
LOG_LEVEL=info
TZ=Asia/Seoul                # cron 시간 해석
```

**첫 운영 체크리스트**
1. 공용 Postgres에 `CREATE SCHEMA gh_trend`
2. `npm run migrate`
3. `npm run ingest -- --day 어제` 수동 1회 검증
4. `docker compose up -d`
5. Caddyfile에 블록 추가 후 `caddy reload`
6. 다음날 04:00 자동 실행 확인

## 10. 외부 의존성 요약

- GitHub Personal Access Token (`public_repo` 권한)
- 공용 Postgres 컨테이너 + `shared_pg` docker network
- 사용자 Caddy 컨테이너 + `caddy_net` docker network
- Cloudflare Tunnel `*.myazit.kr` 라우팅 (기존)
- 선택: Discord 웹훅 URL
