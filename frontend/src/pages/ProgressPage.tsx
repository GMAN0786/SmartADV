import { FunctionComponent, useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import NavigationRail1 from "../components/NavigationRail1";

const ProgressPage: FunctionComponent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const destination: string = (location.state as { destination?: string })?.destination ?? "/view";

  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("영상 업로드 중...");
  const [statusDetail, setStatusDetail] = useState("");
  const [congestion, setCongestion] = useState<{
    queuePosition: number;
    estimatedWaitTimeSeconds: number;
    cpuUsage: number;
    memoryUsage: number;
    s3RemainingMb: number;
    s3RemainingPercent: number;
  } | null>(null);
  const jobDoneRef = useRef(false);
  const videoIdRef = useRef<number | null>(null);

  const formatWaitTime = (seconds: number) => {
    if (seconds <= 0) return "즉시 시작 예정";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}분 ${secs}초`;
    }
    return `${secs}초`;
  };

  useEffect(() => {
    const videoId = (location.state as any)?.videoId;
    videoIdRef.current = videoId;
    if (!videoId) {
      setStatusText("업로드된 영상이 없습니다.");
      return;
    }

    const interval = setInterval(async () => {
      try {
        const savedToken = localStorage.getItem("smartadv_token");
        const headers: HeadersInit = savedToken ? { "Authorization": "Bearer " + savedToken } : {};
        const res = await fetch(`/api/jobs/${videoId}`, { headers });
        if (res.ok) {
          const job = await res.json();
          setProgress(job.progress || 0);

          let text = job.status;
          if (job.status === "PREPROCESSING") text = "영상 분석 중...";
          else if (job.status === "SCRIPT_GENERATING") text = "해설 대본 작성 중...";
          else if (job.status === "TTS_GENERATING") text = "해설 음성 합성 중...";
          else if (job.status === "DONE") text = "완료!";
          else if (job.status === "PENDING") text = "작업 대기 중...";
          else if (job.status === "CANCELLED") text = "작업이 취소되었습니다.";

          setStatusText(text);
          if (job.statusDetail) {
            setStatusDetail(job.statusDetail);
          }

          if (job.queuePosition !== undefined) {
            setCongestion({
              queuePosition: job.queuePosition,
              estimatedWaitTimeSeconds: job.estimatedWaitTimeSeconds,
              cpuUsage: job.cpuUsage,
              memoryUsage: job.memoryUsage,
              s3RemainingMb: job.s3RemainingMb,
              s3RemainingPercent: job.s3RemainingPercent
            });
          }

          if (job.status === "DONE") {
            jobDoneRef.current = true;
            clearInterval(interval);
            // Get the resulting audio url
            const savedToken = localStorage.getItem("smartadv_token");
            const headers: HeadersInit = savedToken ? { "Authorization": "Bearer " + savedToken } : {};
            const resultRes = await fetch(`/api/results/video/${videoId}`, { headers });
            let audioUrl = "";
            let videoUrl = "";
            if (resultRes.ok) {
              const resultData = await resultRes.json();
              audioUrl = resultData.narrationAudioPath;
              videoUrl = resultData.mergedVideoPath;
            }
            setTimeout(() => navigate(destination, { state: { videoId, audioUrl, videoUrl } }), 600);
          } else if (job.status === "FAILED" || job.status === "CANCELLED") {
            jobDoneRef.current = true;
            clearInterval(interval);
            if (job.status === "FAILED") setStatusText("작업 실패!");
            if (job.statusDetail) setStatusDetail(job.statusDetail);
          }
        }
      } catch (e) {
        console.error("Polling Error", e);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [navigate, destination, location.state]);

  // 페이지 이탈 시 작업 취소 로직
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!jobDoneRef.current && videoIdRef.current) {
        const savedToken = localStorage.getItem("smartadv_token");
        const headers: HeadersInit = savedToken ? { "Authorization": "Bearer " + savedToken } : {};
        fetch(`/api/jobs/${videoIdRef.current}/cancel`, { method: "POST", headers, keepalive: true }).catch(() => { });
        e.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // 컴포넌트 언마운트 시 (SPA 내 뒤로가기 등) 취소 호출
      if (!jobDoneRef.current && videoIdRef.current) {
        const savedToken = localStorage.getItem("smartadv_token");
        const headers: HeadersInit = savedToken ? { "Authorization": "Bearer " + savedToken } : {};
        fetch(`/api/jobs/${videoIdRef.current}/cancel`, { method: "DELETE", headers }).catch(() => { });
      }
    };
  }, []);

  const isDone = statusText === "완료!";
  const isFailed = statusText === "작업 실패!";
  const isActive = !isDone && !isFailed;

  return (
    <div className="w-full min-h-screen relative bg-schemes-surface flex flex-col items-start py-0 px-[13px] box-border leading-[normal] tracking-[normal]">
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .spinner {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          border: 5px solid rgba(120, 210, 87, 0.15);
          border-top-color: #78d257;
          animation: spin 1s linear infinite;
        }
        .pulse-text {
          animation: pulse 2s ease-in-out infinite;
        }
        .progress-ring {
          width: 120px;
          height: 120px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .progress-ring svg {
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          transform: rotate(-90deg);
        }
        .progress-ring circle {
          fill: none;
          stroke-width: 5;
        }
        .progress-ring .track {
          stroke: rgba(120, 210, 87, 0.12);
        }
        .progress-ring .fill {
          stroke: #78d257;
          stroke-linecap: round;
          transition: stroke-dashoffset 0.6s ease;
        }
        .congestion-card {
          width: 90%;
          max-width: 440px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.04), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
          padding: 20px;
          margin-top: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .congestion-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.06), 0 10px 10px -5px rgba(0, 0, 0, 0.03);
        }
        .congestion-title {
          font-size: 15px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .metric-group {
          margin-bottom: 12px;
          text-align: left;
        }
        .metric-group:last-child {
          margin-bottom: 0;
        }
        .metric-header {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 5px;
          font-weight: 500;
        }
        .metric-bar-bg {
          width: 100%;
          height: 6px;
          background: #e2e8f0;
          border-radius: 9999px;
          overflow: hidden;
        }
        .metric-bar-fill {
          height: 100%;
          border-radius: 9999px;
          transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .queue-badge-container {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
          border-bottom: 1px dashed #e2e8f0;
          padding-bottom: 14px;
        }
        .queue-badge {
          flex: 1;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          text-align: center;
        }
        .queue-badge-title {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 2px;
        }
        .queue-badge-value {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
      <main className="self-stretch flex-1 flex items-start justify-between py-[5px] px-0 gap-0 text-left text-[16px] text-schemes-on-surface-variant font-[Roboto]">
        <NavigationRail1
          size="Medium"
          state="Enabled"
          type="Square"
          width="Default"
          showLeadingIcon
          leadingIconHeight="unset"
          leadingIconWidth="unset"
          leadingIconBorder="none"
          leadingIconPadding="0"
          leadingIconBackgroundColor="transparent"
        />
        <div className="flex-1 rounded-xl bg-schemes-on-primary flex flex-col items-center py-7 px-0 gap-3.5 mq675:pt-5 mq675:pb-5 mq675:box-border">
          <div className="self-stretch flex flex-col items-center py-0 px-6 gap-2 text-static-display-small-size text-schemes-on-surface">
            <h1 className="m-0 relative text-[length:inherit] leading-static-display-small-line-height font-medium font-[inherit] shrink-0 mq450:text-[22px] mq450:leading-[26px] mq750:text-[29px] mq750:leading-[35px]">
              SmartADV
            </h1>
          </div>
          <div className="self-stretch h-11 flex flex-col items-center py-0 px-6 box-border gap-2">
            <div className="w-[261px] h-[22px] relative leading-static-display-small-line-height font-medium inline-block shrink-0">
              AI기반 화면해설 방송 자동 생성 솔루션
            </div>
          </div>

          <div className="self-stretch flex items-center py-[9px] px-0 text-center text-schemes-on-surface">
            <div className="flex-1 flex flex-col items-center gap-[22px]">
              <div className="self-stretch relative tracking-static-body-large-tracking leading-static-body-large-line-height">
                {isActive ? "영상 처리 중....." : statusText}
              </div>

              {/* Progress Ring with percentage */}
              <div className="progress-ring">
                <svg viewBox="0 0 120 120">
                  <circle className="track" cx="60" cy="60" r="54" />
                  <circle
                    className="fill"
                    cx="60" cy="60" r="54"
                    strokeDasharray={2 * Math.PI * 54}
                    strokeDashoffset={2 * Math.PI * 54 * (1 - progress / 100)}
                  />
                </svg>
                {isActive && <div className="spinner" style={{ position: 'absolute' }} />}
                <span
                  className="relative text-[28px] font-medium"
                  style={{ color: isFailed ? '#e53935' : '#78d257', zIndex: 1 }}
                >
                  {progress}%
                </span>
              </div>

              {/* Main status */}
              <div
                className="self-stretch relative tracking-static-body-large-tracking leading-static-body-large-line-height font-medium"
                style={{ fontSize: '15px' }}
              >
                {statusText}
              </div>

              {/* Detail status */}
              {statusDetail && (
                <div
                  className={`self-stretch relative tracking-static-body-large-tracking leading-static-body-large-line-height text-schemes-on-surface-variant ${isActive ? 'pulse-text' : ''}`}
                  style={{ fontSize: '13px', marginTop: '-12px' }}
                >
                  {statusDetail}
                </div>
              )}

              {/* Real-time Queue & Server Congestion Monitor Card */}
              {isActive && congestion && (
                <div className="congestion-card animate-fade-in mx-auto">
                  <div className="congestion-title">
                    <svg className="w-5 h-5 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                    </svg>
                    <span>실시간 대기열 & 서버 상태</span>
                  </div>

                  <div className="queue-badge-container">
                    <div className="queue-badge">
                      <div className="queue-badge-title">대기 순번</div>
                      <div className="queue-badge-value">
                        {congestion.queuePosition === 0 ? (
                          <span className="text-green-600 font-bold flex items-center justify-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-ping inline-block"></span>
                            현재 처리 중
                          </span>
                        ) : (
                          <span className="text-blue-600 font-bold">{congestion.queuePosition}번</span>
                        )}
                      </div>
                    </div>
                    <div className="queue-badge">
                      <div className="queue-badge-title">예상 대기 시간</div>
                      <div className="queue-badge-value text-slate-800 font-bold">
                        {formatWaitTime(congestion.estimatedWaitTimeSeconds)}
                      </div>
                    </div>
                  </div>

                  {/* CPU Load */}
                  <div className="metric-group">
                    <div className="metric-header">
                      <span>서버 CPU 부하</span>
                      <span className="font-bold text-slate-700">{congestion.cpuUsage.toFixed(1)}%</span>
                    </div>
                    <div className="metric-bar-bg">
                      <div
                        className="metric-bar-fill"
                        style={{
                          width: `${congestion.cpuUsage}%`,
                          backgroundColor: congestion.cpuUsage > 80 ? '#ef4444' : congestion.cpuUsage > 50 ? '#f59e0b' : '#3b82f6'
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* JVM Memory Usage */}
                  <div className="metric-group">
                    <div className="metric-header">
                      <span>서버 메모리 사용량</span>
                      <span className="font-bold text-slate-700">{congestion.memoryUsage.toFixed(1)}%</span>
                    </div>
                    <div className="metric-bar-bg">
                      <div
                        className="metric-bar-fill"
                        style={{
                          width: `${congestion.memoryUsage}%`,
                          backgroundColor: congestion.memoryUsage > 85 ? '#ef4444' : congestion.memoryUsage > 60 ? '#f59e0b' : '#8b5cf6'
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* S3 Capacity Remaining */}
                  <div className="metric-group">
                    <div className="metric-header">
                      <span>S3 스토리지 잔여 용량</span>
                      <span className="font-bold text-slate-700">{(congestion.s3RemainingMb / 1024).toFixed(2)} GB ({(congestion.s3RemainingPercent).toFixed(1)}%)</span>
                    </div>
                    <div className="metric-bar-bg">
                      <div
                        className="metric-bar-fill"
                        style={{
                          width: `${congestion.s3RemainingPercent}%`,
                          backgroundColor: congestion.s3RemainingPercent < 15 ? '#ef4444' : congestion.s3RemainingPercent < 40 ? '#f59e0b' : '#10b981'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProgressPage;
