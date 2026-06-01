import { FunctionComponent, useState, useRef, useEffect } from "react";
import NavigationRail from "../components/NavigationRail";
import DropZone from "../components/DropZone";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

const DragDrop: FunctionComponent = () => {
  const navigate = useNavigate();
  const { addArchiveItem } = useAppContext();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
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

  // 업로드 중 페이지 이탈 시 경고 + 중단 처리
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (xhrRef.current) {
        e.preventDefault();
        // 브라우저에 "정말 나가시겠습니까?" 확인창 표시
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // 컴포넌트 언마운트 시 (뒤로가기 등) 진행 중인 업로드 중단
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
    };
  }, []);

  return (
    <div className="w-full min-h-screen relative bg-schemes-surface flex flex-col items-start py-0 px-[13px] box-border leading-[normal] tracking-[normal]">
      <style>{`
        .mini-congestion-card {
          width: 90%;
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
      <main className="self-stretch flex-1 flex items-start justify-between py-[5px] px-0 gap-0 text-left text-[16px] text-[#000] font-[Roboto]">
        <NavigationRail
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
          <div className="self-stretch h-11 flex flex-col items-center py-0 px-6 box-border gap-2 text-schemes-on-surface-variant">
            <div className="relative leading-static-display-small-line-height font-medium shrink-0">
              AI기반 화면해설 방송 자동 생성 솔루션
            </div>
            <div className="w-[528px] relative tracking-static-title-medium-tracking leading-static-title-medium-line-height font-medium hidden shrink-0">
              Supporting text
            </div>
          </div>
          <DropZone
            uploadProgress={uploadProgress}
            onFileSelected={(file) => {
              if (uploadProgress !== null) return; // Prevent double upload
              
              addArchiveItem({
                title: file.name,
                type: "file",
                fileName: file.name,
              });

              const formData = new FormData();
              formData.append("file", file);
              const clipMode = localStorage.getItem("smartadv_clip_mode") || "AUTO";
              formData.append("clipMode", clipMode);
              const imageResolution = localStorage.getItem("smartadv_image_resolution") || "LOW";
              formData.append("imageResolution", imageResolution);
              
              setUploadProgress(0);

              const xhr = new XMLHttpRequest();
              xhrRef.current = xhr;
              xhr.open("POST", "/api/videos/upload", true);
              
              const savedToken = localStorage.getItem("smartadv_token");
              if (savedToken) {
                xhr.setRequestHeader("Authorization", "Bearer " + savedToken);
              }

              xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                  const percentComplete = Math.round((event.loaded / event.total) * 100);
                  setUploadProgress(percentComplete);
                }
              };

              xhr.onload = () => {
                xhrRef.current = null;
                if (xhr.status >= 200 && xhr.status < 300) {
                  try {
                    const data = JSON.parse(xhr.responseText);
                    navigate("/progress", { state: { destination: "/view", videoId: data.id } });
                  } catch (e) {
                    console.error("Failed to parse response", e);
                    setUploadProgress(null);
                  }
                } else if (xhr.status === 429) {
                  try {
                    const data = JSON.parse(xhr.responseText);
                    const nextTime = new Date(data.nextAvailableTime).toLocaleTimeString("ko-KR", {
                      hour: "numeric",
                      minute: "2-digit"
                    });
                    alert(`[해설 생성 제한]\n\n일반 사용자는 해설 생성 성공 후 3시간에 1회만 생성할 수 있습니다.\n\n다음 생성 가능 시각: ${nextTime}`);
                  } catch (err) {
                    alert("일반 회원은 해설 생성 성공 후 3시간 동안 재생성이 제한됩니다.");
                  }
                  setUploadProgress(null);
                } else {
                  console.error("Upload failed", xhr.statusText);
                  setUploadProgress(null);
                }
              };

              xhr.onerror = () => {
                xhrRef.current = null;
                console.error("Upload Error");
                setUploadProgress(null);
              };

              xhr.send(formData);
            }}
          />
          
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

export default DragDrop;
