"""provider 갈아 끼우기가 실제로 되는지 확인한다.

모델도 API 키도 없이 돈다. 로컬 provider 가 부르는 OpenAI 호환 서버를 이 자리에서
가짜로 하나 띄우고, 진짜 HTTP 왕복을 시켜 본다. 그래서 "로컬 모델이 준비되면
환경변수만 바꾸면 된다"가 말뿐이 아니라는 것을 지금 확인할 수 있다.

    python providers/selftest.py
"""

import json
import os
import re
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Callable, List, Tuple

# 윈도우 콘솔 기본 코드페이지(cp949)에서는 ✓ 나 — 를 찍다 죽는다.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # pragma: no cover - 이미 utf-8 이면 지나간다
    pass

# 이 검사는 파이프라인 의존성을 깔지 않은 곳에서도 돌아야 한다.
try:
    import dotenv  # noqa: F401
except ImportError:  # pragma: no cover - 설치돼 있으면 지나간다
    import types

    stub = types.ModuleType("dotenv")
    stub.load_dotenv = lambda *args, **kwargs: False
    sys.modules["dotenv"] = stub
    print("(python-dotenv 가 없어 검사용 대역을 씁니다 — 검사 결과에는 영향이 없습니다)\n")

# 파일로 직접 실행하므로 저장소 뿌리를 경로에 넣어 준다 (providers, LLM 을 찾기 위해).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

failures: List[str] = []


def check(name: str, passed: bool, detail: str = "") -> None:
    print(f"{'✓' if passed else '✗'} {name}")
    if not passed:
        if detail:
            print(f"   {detail}")
        failures.append(name)


# ── 가짜 OpenAI 호환 서버 ────────────────────────────────────────────────

class _Handler(BaseHTTPRequestHandler):
    """받은 요청을 기록해 두고, 미리 정해 둔 답을 돌려준다."""

    received: List[dict] = []

    def do_POST(self) -> None:  # noqa: N802 - http.server 규약
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        _Handler.received.append({"path": self.path, "body": body})

        if self.path.endswith("/chat/completions"):
            prompt = _first_text(body)
            payload = json.dumps({
                "choices": [{"message": {"content": _answer_for(prompt)}}]
            }).encode("utf-8")
            self._respond(200, "application/json", payload)
        elif self.path.endswith("/audio/speech"):
            self._respond(200, "audio/wav", b"RIFF____WAVEfmt " + b"\x00" * 32)
        else:
            self._respond(404, "text/plain", b"nope")

    def _respond(self, code: int, content_type: str, body: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:
        """검사 출력이 요청 로그로 지저분해지지 않게 한다."""


CANNED = ("silence_id,scene_id,window_start,window_end,text\n"
          "1,1,00:00:12:500,00:00:15:000,골목 입구가 보인다\n")

SCENE_LINE = re.compile(r"- scene(\d+): window=([\d:]+)~([\d:]+)")
SILENCE_HEADER = re.compile(r"## silence(\d+)")


def _first_text(body: dict) -> str:
    """OpenAI 호환 요청에서 프롬프트 글자만 꺼낸다."""
    content = body.get("messages", [{}])[0].get("content", "")
    if isinstance(content, str):
        return content
    return "\n".join(part.get("text", "") for part in content if part.get("type") == "text")


def _answer_for(prompt: str) -> str:
    """받은 프롬프트에 실제로 맞는 CSV 를 지어낸다.

    scene 목록을 읽어 그대로 한 줄씩 돌려주므로, 뒤따르는 후처리와 TTS 가
    "말이 되는" 대본을 받는다. 모델이 아니라 형식만 흉내 내는 것이다.
    """
    rows: List[str] = []
    silence_id = "1"
    for line in prompt.splitlines():
        header = SILENCE_HEADER.search(line)
        if header:
            silence_id = str(int(header.group(1)))
            continue
        scene = SCENE_LINE.search(line)
        if scene:
            rows.append(f"{silence_id},{int(scene.group(1))},{scene.group(2)},{scene.group(3)},"
                        f"검사용 해설 문장 {len(rows) + 1}")

    if not rows:
        return CANNED
    return "```csv\nsilence_id,scene_id,window_start,window_end,text\n" + "\n".join(rows) + "\n```"


def start_fake_server() -> Tuple[HTTPServer, str]:
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    host, port = server.server_address
    return server, f"http://{host}:{port}/v1"


# ── 1. 팩토리가 환경변수대로 고르는가 ────────────────────────────────────

def test_factories() -> None:
    import providers

    cases: List[Tuple[str, str, str, Callable[[], object]]] = [
        ("VLM_PROVIDER", "gemini", "gemini", providers.get_vlm),
        ("VLM_PROVIDER", "local", "local", providers.get_vlm),
        ("TTS_PROVIDER", "edge", "edge", providers.get_tts),
        ("TTS_PROVIDER", "local", "local", providers.get_tts),
        ("STT_PROVIDER", "modal", "modal", providers.get_stt),
        ("STT_PROVIDER", "local", "local", providers.get_stt),
    ]

    for key, value, expected, factory in cases:
        previous = os.environ.get(key)
        os.environ[key] = value
        try:
            chosen = factory()
            check(f"고르기 · {key}={value} → {expected}", chosen.name == expected,
                  f"받은 이름: {chosen.name}")
        except Exception as exc:
            check(f"고르기 · {key}={value} → {expected}", False, str(exc))
        finally:
            if previous is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = previous

    # 기본값 — 아무것도 정하지 않으면 지금 쓰는 조합 그대로여야 한다.
    for key in ("VLM_PROVIDER", "TTS_PROVIDER", "STT_PROVIDER"):
        os.environ.pop(key, None)
    check("고르기 · 기본값은 지금 쓰는 조합", providers.describe_providers() == "VLM=gemini · TTS=edge · STT=modal",
          providers.describe_providers())

    os.environ["VLM_PROVIDER"] = "그런거없음"
    try:
        providers.get_vlm()
        check("고르기 · 모르는 이름은 막는다", False, "오류 없이 지나갔습니다.")
    except providers.ProviderError:
        check("고르기 · 모르는 이름은 막는다", True)
    finally:
        os.environ.pop("VLM_PROVIDER", None)


# ── 2. 로컬 VLM 이 진짜 HTTP 로 대본을 받아 오는가 ───────────────────────

def test_local_vlm(base_url: str, image_path: Path) -> None:
    os.environ["LOCAL_VLM_BASE_URL"] = base_url
    os.environ["LOCAL_VLM_MODEL"] = "검사용-모델"
    os.environ["LOCAL_VLM_MAX_RETRIES"] = "1"

    from providers.base import SceneImages, VLMRequest
    from providers import vlm_local

    # 모듈 상수는 들여올 때 한 번 읽히므로, 검사에서는 여기서 맞춰 준다.
    vlm_local.BASE_URL = base_url
    vlm_local.MODEL = "검사용-모델"
    vlm_local.MAX_RETRIES = 1

    _Handler.received.clear()
    provider = vlm_local.LocalVLM()
    answer = provider.generate(VLMRequest(
        prompt="해설 대본을 CSV로 쓰세요.",
        scenes=[SceneImages(label="[silence001 scene001 이미지]", paths=[image_path, image_path])],
    ))

    check("로컬 VLM · 서버가 준 CSV 를 그대로 돌려준다", "silence_id" in answer and "골목 입구" in answer,
          f"받은 값: {answer[:80]}")

    sent = _Handler.received[-1]["body"] if _Handler.received else {}
    content = sent.get("messages", [{}])[0].get("content", [])
    kinds = [part.get("type") for part in content]

    check("로컬 VLM · 프롬프트가 맨 앞에 온다", kinds[:1] == ["text"], f"조각 순서: {kinds}")
    check("로컬 VLM · scene 라벨과 이미지가 번갈아 실린다", kinds == ["text", "text", "image_url", "image_url"],
          f"조각 순서: {kinds}")
    check("로컬 VLM · 이미지가 base64 로 실린다",
          bool(content) and str(content[-1].get("image_url", {}).get("url", "")).startswith("data:image/"),
          f"받은 값: {str(content[-1])[:60] if content else '(없음)'}")
    check("로컬 VLM · 모델 이름을 함께 보낸다", sent.get("model") == "검사용-모델", str(sent.get("model")))

    # 이미지 상한이 걸리면 처음과 끝은 남기고 고르게 솎아낸다.
    thinned = vlm_local.LocalVLM._thin_out([Path(f"{i}.jpg") for i in range(9)], 3)
    check("로컬 VLM · 이미지를 솎아내도 처음과 끝은 남는다",
          [p.name for p in thinned] == ["0.jpg", "4.jpg", "8.jpg"], str([p.name for p in thinned]))


# ── 3. 로컬 TTS 가 음성 파일을 받아 저장하는가 ───────────────────────────

def test_local_tts(base_url: str) -> None:
    from providers import tts_local

    tts_local.BASE_URL = base_url
    tts_local.VOICE = "검사용-목소리"

    _Handler.received.clear()
    provider = tts_local.LocalTTS()
    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp) / f"segment{provider.audio_suffix}"
        provider.synthesize("골목 입구가 보인다.", output, speed=1.2)
        written = output.exists() and output.stat().st_size > 0

    check("로컬 TTS · 음성 파일이 만들어진다", written)

    sent = _Handler.received[-1]["body"] if _Handler.received else {}
    check("로컬 TTS · 문장과 목소리를 함께 보낸다",
          sent.get("input") == "골목 입구가 보인다." and sent.get("voice") == "검사용-목소리", str(sent))
    check("로컬 TTS · 배속을 함께 보낸다", abs(float(sent.get("speed", 0)) - 1.2) < 0.001, str(sent.get("speed")))


# ── 4. 파이프라인이 provider 를 거쳐 대본을 만드는가 ─────────────────────

def test_pipeline(image_path: Path) -> None:
    import LLM

    silence = LLM.SilenceInfo(silence_id=1, start_seconds=10.0, end_seconds=20.0)
    silence.scenes = [
        LLM.SceneInfo(scene_id=1, window_start_abs=10.0, window_end_abs=15.0,
                      window_duration=5.0, images=[image_path]),
        LLM.SceneInfo(scene_id=2, window_start_abs=15.0, window_end_abs=20.0,
                      window_duration=5.0, images=[]),
    ]

    scenes = LLM.build_scene_images({1: silence})
    check("파이프라인 · scene 마다 이미지 묶음 하나", len(scenes) == 2, f"받은 개수: {len(scenes)}")
    check("파이프라인 · 라벨에 silence·scene 번호가 들어간다",
          scenes[0].label == "[silence001 scene001 이미지]", scenes[0].label)
    check("파이프라인 · 없는 이미지는 세지 않는다",
          LLM.VLMRequest(prompt="", scenes=scenes).image_count() == 1)

    normalized = LLM.normalize_csv_text(
        "```csv\nsilence_id,scene_id,window_start,window_end,text\n"
        "silence001,scene02,00:00:12:500,00:00:15:000,\"골목 입구, 간판이 흔들린다\"\n```"
    )
    check("파이프라인 · 코드블록과 접두사를 걷어낸다",
          normalized.splitlines()[1].startswith("1,2,00:00:12:500"), normalized.splitlines()[1])
    check("파이프라인 · 쉼표가 든 문장이 잘리지 않는다", "골목 입구, 간판이 흔들린다" in normalized)

    check("파이프라인 · 결과 파일 이름이 provider 중립이다",
          LLM.LLM_CSV_OUTPUT_PATH.name == "ad_script.csv", LLM.LLM_CSV_OUTPUT_PATH.name)


# ── 5. LLM.py 를 통째로 돌려 본다 (모델만 가짜) ──────────────────────────

SILENCE_SUMMARY = """[무음구간 요약]
silence001 (00:00:00:000 ~ 00:00:35:000)
scene001 (00:00:02:211 ~ 00:00:12:095)
scene002 (00:00:12:095 ~ 00:00:19:561)
silence002 (00:01:10:000 ~ 00:01:25:000)
scene001 (00:01:12:000 ~ 00:01:20:000)
"""

STT_SUMMARY = """[무음구간1 전]
어디 가는 거야
[무음구간1 후]
곧 도착해
[무음구간2 전]
대사 없음
[무음구간2 후]
여기가 맞나
"""


def write_fixture(output_dir: Path) -> None:
    """전처리(engine.py)가 남기는 것과 같은 모양의 입력을 만들어 둔다."""
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "silence_summary.txt").write_text(SILENCE_SUMMARY, encoding="utf-8")
    (output_dir / "stt_summary.txt").write_text(STT_SUMMARY, encoding="utf-8")

    keyframe = b"\xff\xd8\xff\xe0" + b"scene-keyframe".ljust(60, b"\x00")
    for name in ("silence001_scene001_cut01.jpg", "silence001_scene001_cut02.jpg",
                 "silence001_scene002_cut01.jpg", "silence002_scene001_cut01.jpg"):
        (output_dir / name).write_bytes(keyframe)


def test_end_to_end(output_dir: Path) -> None:
    """전처리 결과 → LLM.py → ad_script.csv 까지 실제로 흘려 본다.

    파이프라인 코드는 손대지 않은 진짜이고, 가짜인 것은 대답하는 모델뿐이다.
    그래서 provider 를 갈아 끼워도 대본이 나온다는 것이 여기서 확인된다.
    """
    import LLM

    # 여기서부터가 진짜 확인이다 — 파이프라인은 그대로 두고 provider 만 바꾼다.
    os.environ["VLM_PROVIDER"] = "local"

    try:
        LLM.main()
    except Exception as exc:
        check("통째로 · LLM.py 가 끝까지 돈다", False, f"{type(exc).__name__}: {exc}")
        return

    check("통째로 · LLM.py 가 끝까지 돈다", True)

    csv_path = output_dir / "ad_script.csv"
    if not csv_path.exists():
        check("통째로 · ad_script.csv 가 생긴다", False, f"{csv_path} 가 없습니다.")
        return

    lines = csv_path.read_text(encoding="utf-8").strip().splitlines()
    check("통째로 · ad_script.csv 가 생긴다", True)
    check("통째로 · 헤더가 규격대로다",
          lines[0] == "silence_id,scene_id,window_start,window_end,text", lines[0])
    check("통째로 · scene 3개가 모두 대본이 된다", len(lines) == 4, f"줄 수: {len(lines)}")
    check("통째로 · silence 번호가 살아 있다",
          lines[1].startswith("1,1,") and lines[3].startswith("2,1,"),
          f"{lines[1][:20]} / {lines[3][:20]}")
    check("통째로 · 시각이 그대로 옮겨진다", "00:00:02:211" in lines[1], lines[1])

    raw = (output_dir / "ad_raw.txt")
    txt = (output_dir / "ad_script.txt")
    check("통째로 · 원본 응답과 읽기용 TXT 도 남는다", raw.exists() and txt.exists())
    check("통째로 · TXT 에 silence·scene 표식이 들어간다",
          "[silence001 scene001]" in txt.read_text(encoding="utf-8"))


# ── 실행 ─────────────────────────────────────────────────────────────────

def main() -> int:
    server, base_url = start_fake_server()
    print(f"가짜 모델 서버: {base_url}\n")

    with tempfile.TemporaryDirectory() as tmp:
        image_path = Path(tmp) / "silence001_scene001_cut01.jpg"
        # JPEG 머리 네 바이트만 진짜다. base64 로 실리는지만 보면 되므로 내용은 아무래도 좋다.
        image_path.write_bytes(b"\xff\xd8\xff\xe0" + b"scene-keyframe".ljust(60, b"\x00"))

        # LLM.py 는 들여올 때 SMARTADV_OUTPUT 을 읽으므로, 그 전에 정해 두어야 한다.
        output_dir = Path(tmp) / "output_clips"
        os.environ["SMARTADV_OUTPUT"] = str(output_dir)
        write_fixture(output_dir)

        try:
            test_factories()
            test_local_vlm(base_url, image_path)
            test_local_tts(base_url)
            test_pipeline(image_path)
            test_end_to_end(output_dir)
        finally:
            server.shutdown()

    print()
    if failures:
        print(f"{len(failures)}건 실패했습니다: {', '.join(failures)}")
        return 1
    print("전부 통과했습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
