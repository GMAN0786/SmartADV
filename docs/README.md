# 문서

프로젝트 전체 설명은 저장소 루트의 [README.md](../README.md) 에 있다. 이 폴더는
주제별 상세 문서를 담는다.

| 문서 | 무엇을 다루나 | 언제 보나 |
|---|---|---|
| [PROVIDERS.md](PROVIDERS.md) | VLM · TTS · STT 를 환경변수로 갈아끼우는 방법. 로컬 서버 설정값, 교체 전 확인 명령, 아직 남은 것 | 외부 API 대신 로컬 모델을 붙일 때 |
| [BACKEND.md](BACKEND.md) | REST API 엔드포인트 명세. 요청·응답 형태, 작업 상태값과 진행률 범위 | 프런트엔드를 붙이거나 API 를 고칠 때 |
| [HOWTO.md](HOWTO.md) | 프런트–백엔드 연동 구조, 업로드에서 스트리밍까지의 흐름, 실행 방법 | 전체 구조를 처음 파악할 때 |

웹 화면 쪽 문서는 코드와 함께 둔다 — [frontend/README.md](../frontend/README.md)
(화면 구조, 라우트, 접근성 규칙, 안드로이드 빌드).

> HOWTO.md 는 백엔드가 파이썬을 Mock 으로 흉내 내던 시절에 쓰였다. 지금은
> `WorkerClientService` 가 실제로 `engine.py` · `LLM.py` · `TTS.py` 를 띄우고
> `PROGRESS:` 출력을 파싱한다. 구조 설명은 여전히 유효하지만 "Mock" 이라고 적힌
> 부분은 실제 구현으로 읽으면 된다.
