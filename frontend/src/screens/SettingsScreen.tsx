import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon } from '../components/icons';
import { SCALE_MAX, SCALE_MIN, THEME_NAMES, THEME_ORDER } from '../constants';
import { useAnnouncer } from '../store/AnnouncerProvider';
import { useAuth } from '../store/AuthProvider';
import { NARRATION_LABELS, useSettings } from '../store/SettingsProvider';
import type { NarrationSettings } from '../types';

const NARRATION_ROWS: { key: keyof NarrationSettings; name: string }[] = [
  { key: 'voice', name: NARRATION_LABELS.voice },
  { key: 'volume', name: NARRATION_LABELS.volume },
  { key: 'rate', name: NARRATION_LABELS.rate },
  { key: 'detail', name: NARRATION_LABELS.detail },
];

/**
 * 접근성 설정.
 *
 * 앱 안에 테마와 글자 크기를 따로 두는 것은 OS 설정을 못 바꾸거나 이 앱에서만
 * 다르게 쓰고 싶은 사용자를 위해서다. 고른 값은 기기에 남아 다음에도 이어진다.
 */
export function SettingsScreen() {
  const settings = useSettings();
  const { user, signOut } = useAuth();
  const { say } = useAnnouncer();
  const navigate = useNavigate();

  const scalePercent = Math.round(settings.scale * 100);
  const atMin = settings.scale <= SCALE_MIN + 0.001;
  const atMax = settings.scale >= SCALE_MAX - 0.001;

  return (
    <div role="main" aria-label="접근성 설정 화면" className="st-screen st-settings">
      <div className="st-settings__full">
        <h1 className="st-title">접근성 설정</h1>
      </div>

      <div className="st-settings__group">
        <h2 className="st-heading">화면</h2>

        <div role="radiogroup" aria-label="테마" className="st-stack" style={{ gap: 8 }}>
          {THEME_ORDER.map((theme) => {
            const selected = settings.theme === theme;
            return (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  settings.setTheme(theme);
                  say(`${THEME_NAMES[theme]}, 선택됨.`);
                }}
                aria-label={`${THEME_NAMES[theme]}, 라디오 버튼, ${selected ? '선택됨' : '선택 안 됨'}`}
                className="st-radio"
              >
                <span aria-hidden="true" className="st-radio__mark">
                  {selected ? '●' : ''}
                </span>
                <span style={{ flex: 1 }}>{THEME_NAMES[theme]}</span>
              </button>
            );
          })}
        </div>

        <div className="st-scale">
          <div className="st-toggle-row__name">글자 크기</div>
          {/* 배율이 바뀌는 순간을 소리로도 확인할 수 있게 라이브 영역으로 둔다. */}
          <div aria-live="polite" className="st-scale__value">
            {scalePercent}%
          </div>
          <div className="st-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <button
              type="button"
              onClick={settings.scaleDown}
              disabled={atMin}
              aria-label={`글자 크기 작게, 버튼. 현재 ${scalePercent}퍼센트${atMin ? ', 최소입니다' : ''}`}
              className="st-btn st-scale__btn"
            >
              <span aria-hidden="true">－</span>
              <span className="st-scale__btn-label">작게</span>
            </button>
            <button
              type="button"
              onClick={settings.scaleUp}
              disabled={atMax}
              aria-label={`글자 크기 크게, 버튼. 현재 ${scalePercent}퍼센트${atMax ? ', 최대입니다' : ''}`}
              className="st-btn st-scale__btn"
            >
              <span aria-hidden="true">＋</span>
              <span className="st-scale__btn-label">크게</span>
            </button>
          </div>
          <div className="st-video-item__meta" style={{ lineHeight: 1.5 }}>
            100%에서 200%까지 10%씩 조절합니다. 화면이 잘리지 않게 배치가 함께 늘어납니다.
          </div>
        </div>

        <SwitchRow
          name="고대비 모드"
          on={settings.theme === 'hc'}
          onDetail="켜짐 · 테두리와 대비가 강해집니다"
          onToggle={() => {
            settings.toggleHighContrast();
            say(`고대비 모드, ${settings.theme === 'hc' ? '꺼짐' : '켜짐'}.`);
          }}
        />
        <SwitchRow
          name="움직임 줄이기"
          on={settings.reduceMotion}
          onDetail="켜짐 · 전환 효과를 최소화합니다"
          onToggle={() => {
            settings.toggleReduceMotion();
            say(`움직임 줄이기, ${settings.reduceMotion ? '꺼짐' : '켜짐'}.`);
          }}
        />
      </div>

      <div className="st-settings__group">
        <h2 className="st-heading">화면해설</h2>

        {NARRATION_ROWS.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => {
              const next = settings.cycleNarration(row.key);
              say(`${row.name}, ${next}.`);
            }}
            aria-label={`${row.name}, 현재 ${settings.narration[row.key]}, 버튼. 두 번 탭하면 다음 값으로 바꿉니다.`}
            className="st-setting-row"
          >
            <span className="st-setting-row__name">{row.name}</span>
            <span className="st-setting-row__value">{settings.narration[row.key]}</span>
            <ChevronRightIcon size={18} />
          </button>
        ))}

        <div className="st-video-item__meta" style={{ lineHeight: 1.5 }}>
          해설 음량과 속도는 해설 음성만 재생할 때 바로 적용됩니다. 음성과 상세도는 다음에 만드는
          해설부터 반영됩니다.
        </div>

        <h2 className="st-heading" style={{ marginTop: 12 }}>
          상호작용
        </h2>
        <SwitchRow
          name="진동 피드백"
          on={settings.haptic}
          onDetail="켜짐 · 소리·문구와 함께 보조로 씁니다"
          onToggle={() => {
            settings.toggleHaptic();
            say(`진동 피드백, ${settings.haptic ? '꺼짐' : '켜짐'}.`);
          }}
        />

        <h2 className="st-heading" style={{ marginTop: 12 }}>
          계정
        </h2>

        {user && (
          <div className="st-account">
            {user.picture ? (
              <img src={user.picture} alt="" className="st-account__avatar" />
            ) : (
              <span aria-hidden="true" className="st-account__avatar" />
            )}
            <span className="st-account__text">
              <span className="st-account__name">{user.name}</span>
              <span className="st-account__email">{user.email}</span>
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            say('로그아웃했습니다.');
            signOut();
            navigate('/login', { replace: true });
          }}
          className="st-btn st-btn--ghost st-btn--block"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}

interface SwitchRowProps {
  name: string;
  on: boolean;
  /** 켜졌을 때 무슨 일이 벌어지는지 한 줄로. 꺼졌을 때는 `꺼짐`만 보인다. */
  onDetail: string;
  onToggle: () => void;
}

/** 켜짐/꺼짐을 위치가 아니라 글자 배지로 알리는 스위치. */
function SwitchRow({ name, on, onDetail, onToggle }: SwitchRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      aria-label={`${name}, 스위치, ${on ? '켜짐' : '꺼짐'}`}
      className="st-toggle-row"
      style={{ minHeight: 64 }}
    >
      <span className="st-toggle-row__text">
        <span className="st-toggle-row__name">{name}</span>
        <span className="st-toggle-row__state">{on ? onDetail : '꺼짐'}</span>
      </span>
      <span aria-hidden="true" className="st-badge">
        {on ? '켜짐' : '꺼짐'}
      </span>
    </button>
  );
}
