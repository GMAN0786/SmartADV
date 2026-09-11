"""진행률 한 줄 규약.

파이썬이 stdout 에 `PROGRESS:45:메시지` 를 찍으면 자바 백엔드가 그대로 읽어
작업 상태에 옮긴다. 규약을 한 곳에만 두어야 provider 를 갈아 끼워도 진행률
표시가 끊기지 않는다.
"""


def report_progress(pct: int, message: str) -> None:
    print(f"PROGRESS:{pct}:{message}", flush=True)
