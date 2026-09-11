/**
 * 앱이 Vite 개발 서버를 직접 바라보게 만든다 — 웹의 `npm run demo` 와 같은 감각.
 *
 * 평소 앱은 build/ 를 통째로 안에 넣고 다니지만, 이 설정을 켜면 앱이 뜰 때마다
 * 개발 서버에서 화면을 받아 온다. 코드를 고치면 폰/에뮬레이터 화면이 바로 새로
 * 그려진다. APK 를 다시 구울 필요가 없다.
 *
 *   node scripts/live-android.mjs --emulator   # 이 PC 의 에뮬레이터
 *   node scripts/live-android.mjs --lan        # 같은 와이파이의 진짜 폰
 *   node scripts/live-android.mjs http://...   # 주소를 직접
 *   node scripts/live-android.mjs --off        # 도로 앱 안의 build/ 를 쓰게
 */
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const PORT = process.env.PORT ?? '5180';

/** 에뮬레이터 안에서 10.0.2.2 는 이 컴퓨터를 가리킨다. */
const EMULATOR_HOST = '10.0.2.2';

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  throw new Error('이 컴퓨터의 랜 주소를 찾지 못했습니다. 주소를 직접 넣어 주세요.');
}

function resolve(argument) {
  if (!argument || argument === '--emulator') return `http://${EMULATOR_HOST}:${PORT}`;
  if (argument === '--lan') return `http://${lanAddress()}:${PORT}`;
  if (argument === '--off') return null;
  if (/^https?:\/\//.test(argument)) return argument.replace(/\/$/, '');
  throw new Error(`모르는 인자입니다: ${argument}`);
}

const url = resolve(process.argv[2]);

console.log(url
  ? `앱이 바라볼 곳: ${url}\n  (개발 서버를 'npm run demo -- --host --port ${PORT}' 로 띄워 두세요)`
  : '앱 안의 build/ 를 다시 쓰도록 되돌립니다.');

execFileSync('npx', ['cap', 'sync', 'android'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...(url ? { CAP_LIVE_URL: url } : {}) },
});

console.log(url
  ? '\n설정을 옮겼습니다. 앱을 한 번 다시 설치(또는 실행)하면 그때부터 개발 서버를 따라갑니다.'
  : '\n되돌렸습니다. 앱을 다시 설치하면 안에 든 화면을 씁니다.');
