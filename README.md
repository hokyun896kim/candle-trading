# 캔들매매 — 비단길 캔들 단독 체계 (넷리파이 웹앱)

탭1 **개념**: 합봉 → 게이트 → 매수 → 하락전환/양봉매도 → 쌍봉경고, 시간축 매핑, 2축(주봉=상태·일봉=타이밍) 운용 규칙. SVG 도해 포함.
탭2 **검증**: 종목명/코드 입력 → 네이버 금융에서 일봉(3년)·주봉(10년) 받아서 캔들 규칙으로 판정. 종합 판정 카드 + 주봉/일봉 패널(상태·보유선/전환선·차트·신호 이력).

## 배포 (3분)
1. 이 폴더를 깃허브 레포로 올린다 (예: `candle-trading`).
2. 넷리파이 → Add new site → Import from Git → 레포 선택.
   - Build command: 비움 / Publish directory: `public` (netlify.toml에 이미 있음)
3. 배포 완료되면 `/api/ohlc`, `/api/search`가 Netlify Functions로 자동 연결된다.

로컬에서 `index.html`을 그냥 열면 `/api`가 없어서 검증 탭은 안 된다. `npx netlify dev`로 띄우면 된다.

## 구조
```
public/
  index.html   탭 2개 + 개념 본문
  style.css    당근 스타일 (주황 #FF6F0F, 흰 카드, 둥근 모서리, 모바일 퍼스트)
  concept.js   개념 도해 SVG 렌더러
  engine.js    판정 엔진 (브라우저/node 공용)
  app.js       검증 탭: 검색·호출·렌더·차트(lightweight-charts)
netlify/functions/
  ohlc.js      네이버 chart API 프록시  /api/ohlc?code=005930&tf=day|week
  search.js    네이버 자동완성 프록시  /api/search?q=삼성
netlify.toml
```

## 판정 규칙 (engine.js)
- 양봉 = 종가 ≥ 시가. 연속 같은 색 = 합봉 블록. 고점/저점은 꼬리 포함.
- 상승 전환: 양봉 종가 > 직전 음봉블록 고점.
- 하락 전환: 음봉 종가 < 직전 양봉블록 저점(보유선).
- 상승 상태 + 음봉 + 보유선 유지 → 매수(첫 음봉 표시). 쌍봉 경고 중이면 매수 차단.
- 하락 상태 + 양봉 → 반등 매도. 직전 음봉블록 고점을 종가로 넘기 전까지.
- 쌍봉 경고: 직전 양봉블록이 직전 음봉블록 고점을 종가로 못 넘었고, 현재 음봉블록 고점이 그보다 낮다.
- 2축 종합: 주봉 상승+보유선 유지일 때만 일봉 매매 허용. 주봉 살아있는데 일봉 하락 → 일봉대로 매도. 주봉 깨졌는데 일봉 살아있음 → 신규매수 중단, 보유분은 일봉 신호대로 양봉에 매도.

## 주의
- 일봉은 15:30 종가, 주봉은 금요일 종가로 확정. 장중/주중에는 "진행 중" 배지가 뜬다.
- 네이버 주봉 localDate는 그 주의 일요일(주 시작)이다.
- 거래정지·액면분할·감자 종목은 구간이 왜곡될 수 있다. 차트로 한 번 더 본다.
- 네이버 API는 비공식이라 형식이 바뀌면 `ohlc.js`의 필드명만 고치면 된다.

## 엔진 단독 테스트
```
node -e "const E=require('./public/engine.js');console.log(E.analyze(E.fromNaver(require('./sample.json'))))"
```
