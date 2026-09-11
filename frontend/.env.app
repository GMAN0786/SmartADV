# 하이브리드 앱(실서버) 빌드 설정. `npm run build:app` 이 읽는다.

# 앱은 Vite 프록시를 탈 수 없으므로 백엔드 절대 주소가 반드시 필요하다.
# 예) https://api.scenetalk.example  (평문 http 는 안드로이드가 막는다)
VITE_API_BASE_URL=

# 앱 번들에는 서버 쪽 새로고침 대응이 없다. 해시 경로여야 어느 화면에서
# 앱을 다시 열어도 그 화면이 살아난다.
VITE_ROUTER=hash

VITE_GOOGLE_CLIENT_ID=
VITE_DEMO=
