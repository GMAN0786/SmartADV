import { FunctionComponent, useState, useCallback, useEffect } from "react";
import { Button } from "@mui/material";
import NavigationRail1 from "../components/NavigationRail1";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

const fetchYouTubeTitle = async (url: string): Promise<string> => {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (res.ok) {
      const data = await res.json();
      return data.title as string;
    }
  } catch {
    /* ignore */
  }
  return url;
};

const Main: FunctionComponent = () => {
  const navigate = useNavigate();
  const { addArchiveItem } = useAppContext();
  const [urlInput, setUrlInput] = useState("");
  const [congestion, setCongestion] = useState<{
    queuePosition: number;
    estimatedWaitTimeSeconds: number;
    cpuUsage: number;
    memoryUsage: number;
    s3RemainingMb: number;
    s3RemainingPercent: number;
  } | null>(null);

  useEffect(() => {
    const fetchCongestion = async () => {
      try {
        const savedToken = localStorage.getItem("smartadv_token");
        const headers: HeadersInit = savedToken ? { "Authorization": "Bearer " + savedToken } : {};
        const res = await fetch("/api/jobs/congestion", { headers });
        if (res.ok) {
          const data = await res.json();
          setCongestion(data);
        }
      } catch (e) {
        console.error("Failed to fetch system congestion", e);
      }
    };

    fetchCongestion();
    const interval = setInterval(fetchCongestion, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatWaitTime = (seconds: number) => {
    if (seconds <= 0) return "즉시 시작 예정";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}분 ${secs}초`;
    }
    return `${secs}초`;
  };

  const onTrailingElementsIconClick = useCallback(async () => {
    const raw = urlInput.trim();
    if (!raw) return;

    const isYouTubeUrl =
      raw.includes("youtube.com/watch") || raw.includes("youtu.be/");
    
    if (!isYouTubeUrl) {
      alert("죄송합니다. 현재는 유튜브(YouTube) 동영상 URL만 지원합니다.");
      return;
    }

    try {
      const savedToken = localStorage.getItem("smartadv_token");
      const headers: HeadersInit = {
        "Content-Type": "application/json"
      };
      if (savedToken) {
        headers["Authorization"] = "Bearer " + savedToken;
      }

      const clipMode = localStorage.getItem("smartadv_clip_mode") || "AUTO";
      const imageResolution = localStorage.getItem("smartadv_image_resolution") || "LOW";
      const res = await fetch("/api/videos/youtube", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: raw, clipMode, imageResolution })
      });

      if (res.ok) {
        const data = await res.json();
        const title = await fetchYouTubeTitle(raw);
        addArchiveItem({ title, type: "url", url: raw });
        navigate("/progress", { state: { destination: "/view", videoId: data.id } });
      } else if (res.status === 429) {
        try {
          const data = await res.json();
          const nextTime = new Date(data.nextAvailableTime).toLocaleTimeString("ko-KR", {
            hour: "numeric",
            minute: "2-digit"
          });
          alert(`[해설 생성 제한]\n\n일반 사용자는 해설 생성 성공 후 3시간에 1회만 생성할 수 있습니다.\n\n다음 생성 가능 시각: ${nextTime}`);
        } catch (err) {
          alert("일반 회원은 해설 생성 성공 후 3시간 동안 재생성이 제한됩니다.");
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || "동영상 추출 및 분석 시작에 실패했습니다.");
      }
    } catch (e) {
      console.error("YouTube URL processing error", e);
      alert("서버 통신 오류가 발생했습니다.");
    }
  }, [navigate, urlInput, addArchiveItem]);

  return (
    <div className="w-full min-h-screen relative bg-schemes-surface flex flex-col items-start py-0 px-[13px] box-border leading-[normal] tracking-[normal]">
      <style>{`
        .mini-congestion-card {
          width: 95%;
          max-width: 500px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          padding: 12px 16px;
          margin-top: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.01);
          animation: fadeIn 0.4s ease-out forwards;
        }
        .mini-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          border-bottom: 1px solid #f1f5f9;
          padding-bottom: 5px;
        }
        .mini-card-title {
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .mini-card-wait {
          font-size: 11px;
          font-weight: 500;
          color: #475569;
        }
        .mini-metrics-row {
          display: flex;
          gap: 12px;
        }
        .mini-metric-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          text-align: left;
        }
        .mini-metric-label {
          font-size: 10px;
          color: #64748b;
          display: flex;
          justify-content: space-between;
        }
        .mini-bar-bg {
          width: 100%;
          height: 4px;
          background: #e2e8f0;
          border-radius: 9999px;
          overflow: hidden;
        }
        .mini-bar-fill {
          height: 100%;
          border-radius: 9999px;
          transition: width 0.8s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
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
              <div className="w-[528px] relative text-static-title-medium-size tracking-static-title-medium-tracking leading-static-title-medium-line-height font-medium text-schemes-on-surface-variant hidden shrink-0">
                Supporting text
              </div>
            </div>
            <div className="self-stretch h-11 flex flex-col items-center py-0 px-6 box-border gap-2">
              <div className="w-[261px] h-[22px] relative leading-static-display-small-line-height font-medium inline-block shrink-0">
                AI기반 화면해설 방송 자동 생성 솔루션
              </div>
              <div className="w-[528px] relative tracking-static-title-medium-tracking leading-static-title-medium-line-height font-medium hidden shrink-0">
                Supporting text
              </div>
            </div>
            <div className="self-stretch flex items-center justify-center p-2.5">
              <div className="h-14 flex-1 rounded-[28px] bg-schemes-surface-container-high overflow-hidden flex items-center justify-center max-w-[720px] mq750:max-w-full">
                <div className="self-stretch w-[720px] flex items-center px-2 py-1 box-border gap-2">
                  <div className="flex-1 flex items-center py-0 px-4">
                    <input
                      className="w-full [border:none] [outline:none] bg-[transparent] relative tracking-static-body-large-tracking leading-static-body-large-line-height font-[Roboto] text-static-body-large-size text-schemes-on-surface p-0"
                      placeholder="변환하고 싶은 동영상의 URL을 입력하거나, 검색하고 싶은 동영상의 제목을 입력하세요"
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onTrailingElementsIconClick();
                        }
                      }}
                    />
                  </div>
                  <Button
                    disableElevation
                    variant="contained"
                    sx={{
                      borderRadius: "20px",
                      height: 36,
                      paddingX: "16px",
                      textTransform: "none",
                      fontSize: "14px",
                      fontWeight: 600,
                      fontFamily: "Roboto",
                      backgroundColor: "#000",
                      "&:hover": { backgroundColor: "#333" },
                      flexShrink: 0,
                    }}
                    onClick={onTrailingElementsIconClick}
                  >
                    생성
                  </Button>
                </div>
              </div>
            </div>
            <div className="w-[519px] h-[22px] relative leading-static-display-small-line-height font-medium inline-block">
              인공지능이 자동 생성하는 해설이므로, 실제 영상 내용과 다소 다를 수
              있습니다.
            </div>

            {/* Real-time mini system status dashboard */}
            {congestion && (
              <div className="mini-congestion-card text-left">
                <div className="mini-card-header">
                  <div className="mini-card-title">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span>실시간 서버 상태 {congestion.queuePosition > 0 ? `(대기열 ${congestion.queuePosition}개)` : '(즉시 시작 가능)'}</span>
                  </div>
                  <div className="mini-card-wait">
                    예상 대기: <span className="font-bold text-blue-600">{congestion.queuePosition > 0 ? formatWaitTime(congestion.estimatedWaitTimeSeconds) : '즉시 시작'}</span>
                  </div>
                </div>
                <div className="mini-metrics-row">
                  {/* CPU */}
                  <div className="mini-metric-col">
                    <div className="mini-metric-label">
                      <span>CPU 부하</span>
                      <span className="font-bold">{congestion.cpuUsage.toFixed(0)}%</span>
                    </div>
                    <div className="mini-bar-bg">
                      <div 
                        className="mini-bar-fill" 
                        style={{ 
                          width: `${congestion.cpuUsage}%`, 
                          backgroundColor: congestion.cpuUsage > 80 ? '#ef4444' : congestion.cpuUsage > 50 ? '#f59e0b' : '#3b82f6'
                        }}
                      />
                    </div>
                  </div>

                  {/* Memory */}
                  <div className="mini-metric-col">
                    <div className="mini-metric-label">
                      <span>메모리</span>
                      <span className="font-bold">{congestion.memoryUsage.toFixed(0)}%</span>
                    </div>
                    <div className="mini-bar-bg">
                      <div 
                        className="mini-bar-fill" 
                        style={{ 
                          width: `${congestion.memoryUsage}%`, 
                          backgroundColor: congestion.memoryUsage > 85 ? '#ef4444' : congestion.memoryUsage > 60 ? '#f59e0b' : '#8b5cf6'
                        }}
                      />
                    </div>
                  </div>

                  {/* S3 Storage */}
                  <div className="mini-metric-col">
                    <div className="mini-metric-label">
                      <span>S3 여유</span>
                      <span className="font-bold">{congestion.s3RemainingPercent.toFixed(0)}%</span>
                    </div>
                    <div className="mini-bar-bg">
                      <div 
                        className="mini-bar-fill" 
                        style={{ 
                          width: `${congestion.s3RemainingPercent}%`, 
                          backgroundColor: congestion.s3RemainingPercent < 15 ? '#ef4444' : '#10b981'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
    </div>
  );
};

export default Main;
