import {
  FunctionComponent,
  useMemo,
  type CSSProperties,
  useCallback,
  useState,
  useEffect,
} from "react";
import IconButtonStandard from "./IconButtonStandard";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

export type NavigationRail1Type = {
  className?: string;
  size?: CSSProperties["size"];
  state?: CSSProperties["state"];
  type?: CSSProperties["type"];
  width?: CSSProperties["width"];
  showLeadingIcon?: boolean;
  leadingIconHeight?: CSSProperties["height"];
  leadingIconWidth?: CSSProperties["width"];
  leadingIconBorder?: CSSProperties["border"];
  leadingIconPadding?: CSSProperties["padding"];
  leadingIconBackgroundColor?: CSSProperties["backgroundColor"];

  /** Style props */
  navigationRailPosition?: CSSProperties["position"];
  navigationRailTop?: CSSProperties["top"];
  navigationRailLeft?: CSSProperties["left"];
  menuFabPadding?: CSSProperties["padding"];
};

const NavigationRail1: FunctionComponent<NavigationRail1Type> = ({
  className = "",
  navigationRailPosition,
  navigationRailTop,
  navigationRailLeft,
  menuFabPadding,
  size = "Small",
  state,
  type = "Round",
  width,
  showLeadingIcon,
  leadingIconHeight,
  leadingIconWidth,
  leadingIconBorder,
  leadingIconPadding,
  leadingIconBackgroundColor,
}) => {
  const navigationRailStyle: CSSProperties = useMemo(() => {
    return {
      position: navigationRailPosition,
      top: navigationRailTop,
      left: navigationRailLeft,
    };
  }, [navigationRailPosition, navigationRailTop, navigationRailLeft]);

  const menuFabStyle: CSSProperties = useMemo(() => {
    return {
      padding: menuFabPadding,
    };
  }, [menuFabPadding]);

  const navigate = useNavigate();
  const { user, logout, token, isMaintenanceMode, checkMaintenance } = useAppContext();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [latestJob, setLatestJob] = useState<any>(null);
  const [isLoadingJob, setIsLoadingJob] = useState(false);
  const [clipMode, setClipMode] = useState<string>("AUTO");
  const [imageResolution, setImageResolution] = useState<string>("LOW");
  
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);

  // Load clip mode, image resolution, and maintenance status when modal opens
  useEffect(() => {
    if (isSettingsOpen) {
      const savedMode = localStorage.getItem("smartadv_clip_mode") || "AUTO";
      setClipMode(savedMode);
      const savedRes = localStorage.getItem("smartadv_image_resolution") || "LOW";
      setImageResolution(savedRes);
      setMaintenanceActive(isMaintenanceMode);
    }
  }, [isSettingsOpen, isMaintenanceMode]);

  const handleClipModeChange = (mode: string) => {
    setClipMode(mode);
    localStorage.setItem("smartadv_clip_mode", mode);
  };

  const handleImageResolutionChange = (res: string) => {
    setImageResolution(res);
    localStorage.setItem("smartadv_image_resolution", res);
  };

  const handleMaintenanceToggle = async () => {
    setIsTogglingMaintenance(true);
    try {
      const res = await fetch("/api/maintenance/toggle", {
        method: "POST",
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenanceActive(data.enabled);
        await checkMaintenance();
      } else {
        const err = await res.json();
        alert(err.error || "점검 모드 전환에 실패했습니다.");
      }
    } catch (e) {
      console.error("Failed to toggle maintenance mode", e);
      alert("점검 모드 설정 중 오류가 발생했습니다.");
    } finally {
      setIsTogglingMaintenance(false);
    }
  };

  const onSettingsClick = useCallback(() => {
    console.log("[NavigationRail1] Settings clicked!");
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  useEffect(() => {
    if (isSettingsOpen && user && user.role === "ADMIN") {
      const fetchLatestJob = async () => {
        setIsLoadingJob(true);
        try {
          const res = await fetch("/api/jobs/latest", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
          });
          if (res.ok) {
            const data = await res.json();
            setLatestJob(data);
          } else {
            setLatestJob(null);
          }
        } catch (e) {
          console.error("Failed to fetch latest job", e);
          setLatestJob(null);
        } finally {
          setIsLoadingJob(false);
        }
      };
      fetchLatestJob();
    }
  }, [isSettingsOpen, user, token]);

  const onUploadClick = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const onFABClick = useCallback(() => {
    navigate("/url");
  }, [navigate]);

  const onArchiveClick = useCallback(() => {
    navigate("/archive");
  }, [navigate]);

  const onLikesClick = useCallback(() => {
    navigate("/likes");
  }, [navigate]);

  return (
    <>
      <div
        className={`min-h-screen w-[72px] overflow-hidden shrink-0 flex flex-col items-center pt-11 px-0 pb-14 box-border gap-[78px] text-center text-static-label-medium-size text-schemes-secondary font-[Roboto] mq750:pt-[29px] mq750:pb-9 mq750:box-border relative z-[50] ${className}`}
        style={navigationRailStyle}
      >
        <div
          className="flex flex-col items-center gap-[13px] shrink-0"
          style={menuFabStyle}
        >
          <IconButtonStandard
            size={size}
            state={state}
            type={type}
            width={width}
            showLeadingIcon={showLeadingIcon}
            leadingIconHeight={leadingIconHeight}
            leadingIconWidth={leadingIconWidth}
            leadingIconBorder={leadingIconBorder}
            leadingIconPadding={leadingIconPadding}
            leadingIconBackgroundColor={leadingIconBackgroundColor}
            onClick={() => {
              if (user) {
                if (window.confirm("로그아웃 하시겠습니까?")) {
                  logout();
                }
              } else {
                navigate("/login");
              }
            }}
          />
          <div className="w-[62px] h-[75px] flex flex-col items-center gap-1 cursor-pointer" onClick={onUploadClick}>
            <div className="flex items-start py-0 px-[3px]">
              <img
                className="h-14 w-14 rounded-corner-large"
                loading="lazy"
                alt=""
                src="/FAB1.svg"
              />
            </div>
            <div className="w-[62px] h-[15px] relative tracking-static-label-medium-tracking leading-static-label-medium-line-height font-medium inline-block text-center">
              Upload
            </div>
          </div>
          <div className="w-[62px] h-[75px] flex flex-col items-center gap-1 cursor-pointer" onClick={onFABClick}>
            <div className="flex items-start py-0 px-[3px]">
              <img
                className="h-14 w-14 rounded-corner-large"
                loading="lazy"
                alt=""
                src="/FAB.svg"
              />
            </div>
            <div className="w-[62px] h-[15px] relative tracking-static-label-medium-tracking leading-static-label-medium-line-height font-medium inline-block text-center">
              URL
            </div>
          </div>
        </div>
        <div className="self-stretch flex flex-col items-start gap-1 shrink-0">
          <div className="self-stretch flex flex-col items-center justify-center py-1.5 px-0 gap-1 cursor-pointer" onClick={onArchiveClick}>
            <button className="cursor-pointer [border:none] p-0 bg-schemes-secondary-container rounded-2xl overflow-hidden flex flex-col items-center justify-center">
              <div className="w-14 h-8 flex items-center justify-center relative isolate">
                <img
                  className="cursor-pointer [border:none] p-0 bg-[transparent] w-6 relative max-h-full z-[0]"
                  alt=""
                  src="/archive.svg"
                />
                <img
                  className="cursor-pointer [border:none] p-0 bg-[transparent] h-6 w-6 absolute !!m-[0 important] top-[calc(50%_-_12px)] left-[calc(50%_-_12px)] z-[1]"
                  alt=""
                />
              </div>
            </button>
            <div className="self-stretch relative tracking-static-label-medium-tracking leading-static-label-medium-line-height font-medium">
              Archive
            </div>
          </div>
          <div className="self-stretch flex flex-col items-center justify-center py-1.5 px-0 gap-1 text-schemes-on-surface-variant cursor-pointer" onClick={onLikesClick}>
            <img
              className="cursor-pointer [border:none] p-0 bg-[transparent] w-6 h-6 relative"
              alt=""
              src="/star-filled.svg"
            />
            <div className="self-stretch relative tracking-static-label-medium-tracking leading-static-label-medium-line-height font-medium">
              Likes
            </div>
          </div>
        </div>
        <div className="self-stretch flex flex-col items-center justify-center py-1.5 px-0 gap-1 shrink-0 text-schemes-on-surface-variant cursor-pointer relative z-[60]" onClick={onSettingsClick}>
          <img
            className="cursor-pointer [border:none] p-0 bg-[transparent] w-6 h-6 relative"
            alt=""
            src="/settings.svg"
          />
          <div className="self-stretch relative tracking-static-label-medium-tracking leading-static-label-medium-line-height font-medium">
            Settings
          </div>
        </div>
      </div>

      {isSettingsOpen && (
        <div 
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
          style={{ zIndex: 99999 }}
          onClick={closeSettings}
        >
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; backdrop-filter: blur(0px); }
              to { opacity: 1; backdrop-filter: blur(8px); }
            }
            @keyframes scaleUp {
              from { transform: scale(0.95); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            .animate-fade-in {
              animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .animate-scale-up {
              animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .custom-scrollbar::-webkit-scrollbar {
              width: 5px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: rgba(156, 163, 175, 0.2);
              border-radius: 99px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: rgba(156, 163, 175, 0.4);
            }
          `}</style>

          <div 
            className="w-full max-w-md bg-white/80 dark:bg-slate-900/90 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl shadow-2xl p-6 relative overflow-y-auto max-h-[90vh] custom-scrollbar backdrop-blur-xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontFamily: "Roboto, system-ui, -apple-system, sans-serif",
            }}
          >
            {/* Design header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </span>
                설정 (Settings)
              </h2>
              <button 
                onClick={closeSettings}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User Profile Info */}
            {user ? (
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 mb-6 border border-slate-100 dark:border-slate-800/30 flex items-center gap-3">
                <img 
                  src={user.picture || "/default-avatar.png"} 
                  alt={user.name} 
                  className="w-10 h-10 rounded-full border border-blue-500/20"
                />
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{user.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                  <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/30">
                    {user.role} 계정
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-slate-500 dark:text-slate-400 text-sm">
                로그인이 필요합니다.
              </div>
            )}

            {/* Clip Generation Mode Section (Visible to all users) */}
            {user && (
              <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4 mb-5 text-left">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  화면해설 클립 생성 설정
                </h3>
                <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/30 rounded-xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-normal">
                    영상 분석 및 해설 생성 시 토큰 비용 절감을 위한 비디오 클립 생성 정책을 설정합니다.
                  </div>
                  <div className="flex flex-col gap-2">
                    {[
                      { value: "AUTO", label: "자동 (AUTO)", desc: "이미지 대비 비디오 토큰 소모량을 분석해 더 저렴한 방식을 자동 채택합니다." },
                      { value: "FORCE_IMAGE", label: "이미지만 사용 (FORCE_IMAGE)", desc: "비디오 클립화를 사용하지 않고 항상 키프레임 스크린샷만 사용합니다." },
                      { value: "FORCE_VIDEO", label: "비디오 항상 사용 (FORCE_VIDEO)", desc: "토큰 비용에 관계없이 항상 480p 고압축 비디오 클립을 생성합니다." }
                    ].map((opt) => (
                      <div 
                        key={opt.value}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          clipMode === opt.value 
                            ? "bg-blue-50/40 dark:bg-blue-950/20 border-blue-500/20 dark:border-blue-500/10 shadow-sm" 
                            : "border-transparent hover:bg-slate-100/30 dark:hover:bg-slate-800/20"
                        }`}
                        onClick={() => handleClipModeChange(opt.value)}
                      >
                        <input 
                          type="radio" 
                          name="clipMode"
                          value={opt.value}
                          checked={clipMode === opt.value}
                          onChange={() => {}} // Controlled by label click
                          className="mt-1 accent-blue-500 cursor-pointer"
                        />
                        <div>
                          <div className={`text-xs font-bold ${clipMode === opt.value ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"}`}>
                            {opt.label}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">
                            {opt.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Image Resolution Selection Section */}
            {user && (
              <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4 mb-5 text-left animate-fade-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  이미지 모드 처리 화질 설정
                </h3>
                <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/30 rounded-xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-normal">
                    이미지 기반 해설 생성 시 토큰 비용 및 환각(Hallucination) 방지를 위한 화질 수준을 설정합니다.
                  </div>
                  <div className="flex flex-col gap-2">
                    {[
                      { value: "LOW", label: "낮은 화질 (LOW)", desc: "이미지당 280 토큰만 소모하여 비용을 75% 대폭 절감하지만 세부 묘사력이 떨어질 수 있습니다." },
                      { value: "UNSPECIFIED", label: "높은 화질 (HIGH)", desc: "이미지당 1,120 토큰을 사용하여 인물의 미세한 표정이나 화면 속 작은 글자까지 정밀하게 분석합니다." }
                    ].map((opt) => (
                      <div 
                        key={opt.value}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          imageResolution === opt.value 
                            ? "bg-blue-50/40 dark:bg-blue-950/20 border-blue-500/20 dark:border-blue-500/10 shadow-sm" 
                            : "border-transparent hover:bg-slate-100/30 dark:hover:bg-slate-800/20"
                        }`}
                        onClick={() => handleImageResolutionChange(opt.value)}
                      >
                        <input 
                          type="radio" 
                          name="imageResolution"
                          value={opt.value}
                          checked={imageResolution === opt.value}
                          onChange={() => {}}
                          className="mt-1 accent-blue-500 cursor-pointer"
                        />
                        <div>
                          <div className={`text-xs font-bold ${imageResolution === opt.value ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"}`}>
                            {opt.label}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">
                            {opt.desc}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Administrator Section */}
            {user && user.role === "ADMIN" && (
              <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4 mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 text-left">
                  서비스 제어 설정 (ADMIN ONLY)
                </h3>
                <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/30 rounded-xl p-4 text-left mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        서비스 점검 모드 (Maintenance Mode)
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-normal max-w-[240px]">
                        활성화 시 일반 사용자의 접속이 차단되며, "점검 중" 안내 페이지가 노출됩니다.
                      </div>
                    </div>
                    
                    {/* iOS-style Toggle Switch */}
                    <button
                      disabled={isTogglingMaintenance}
                      onClick={handleMaintenanceToggle}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        maintenanceActive ? "bg-rose-500" : "bg-slate-200 dark:bg-slate-800"
                      } ${isTogglingMaintenance ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          maintenanceActive ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Administrator Section */}
            {user && user.role === "ADMIN" && (
              <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 text-left">
                  관리자 시스템 모니터링
                </h3>

                {isLoadingJob ? (
                  <div className="flex justify-center py-8">
                    <span className="relative flex h-8 w-8">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-8 w-8 bg-blue-500"></span>
                    </span>
                  </div>
                ) : latestJob ? (
                  <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-white rounded-xl p-5 border border-slate-800 shadow-lg relative overflow-hidden text-left">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
                    
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-xs text-slate-400">최근 생성 요청 ID</div>
                        <div className="text-sm font-mono font-bold text-blue-400">#{latestJob.id}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        latestJob.status === "DONE" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                        latestJob.status === "FAILED" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                        "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                      }`}>
                        {latestJob.status}
                      </span>
                    </div>

                    {/* Token usage metrics */}
                    <div className="grid grid-cols-2 gap-4 mt-4 border-t border-slate-800/80 pt-4">
                      <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 text-center">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">입력 토큰 (Prompt)</div>
                        <div className="text-lg font-mono font-bold text-indigo-300">
                          {latestJob.llmInputTokens !== null && latestJob.llmInputTokens !== undefined
                            ? latestJob.llmInputTokens.toLocaleString()
                            : "-"}
                        </div>
                      </div>
                      <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 text-center">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">출력 토큰 (Output)</div>
                        <div className="text-lg font-mono font-bold text-violet-300">
                          {latestJob.llmOutputTokens !== null && latestJob.llmOutputTokens !== undefined
                            ? latestJob.llmOutputTokens.toLocaleString()
                            : "-"}
                        </div>
                      </div>
                    </div>

                    {/* Total Tokens Display */}
                    {(latestJob.llmInputTokens !== null && latestJob.llmOutputTokens !== null && latestJob.llmInputTokens !== undefined && latestJob.llmOutputTokens !== undefined) && (
                      <div className="mt-3 bg-blue-500/5 rounded-lg p-2.5 flex justify-between items-center text-xs border border-blue-500/10">
                        <span className="text-slate-400">총합 토큰 사용량</span>
                        <span className="font-mono font-bold text-blue-300">
                          {(latestJob.llmInputTokens + latestJob.llmOutputTokens).toLocaleString()} Tokens
                        </span>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-500 mt-4 text-right">
                      요청일시: {latestJob.startedAt ? new Date(latestJob.startedAt).toLocaleString() : "-"}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                    생성 요청 이력이 존재하지 않습니다.
                  </div>
                )}
              </div>
            )}

            {/* Non-admin / default view */}
            {user && user.role !== "ADMIN" && (
              <div className="border-t border-slate-100 dark:border-slate-800/50 pt-4 text-center py-6">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  일반 사용자 설정 페이지입니다. <br/>
                  화면해설 생성 세부 성능 모니터링은 <span className="font-bold text-blue-500">관리자(ADMIN)</span> 계정만 조회할 수 있습니다.
                </p>
              </div>
            )}

            {/* Button */}
            <div className="mt-6 flex justify-end">
              <button 
                onClick={closeSettings}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 hover:scale-105 active:scale-95 text-white rounded-xl font-medium text-sm transition-all cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NavigationRail1;
