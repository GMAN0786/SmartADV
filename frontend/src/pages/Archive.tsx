import { FunctionComponent, useEffect } from "react";
import NavigationRail1 from "../components/NavigationRail1";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

const Archive: FunctionComponent = () => {
  const navigate = useNavigate();
  const { archiveItems, toggleLike, setCurrentItem, fetchArchive, deleteArchiveItem } = useAppContext();

  useEffect(() => {
    fetchArchive();
  }, []);

  return (
    <div className="w-full min-h-screen relative bg-schemes-surface flex flex-col items-start py-0 px-[13px] box-border leading-[normal] tracking-[normal]">
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
              <div className="relative leading-static-display-small-line-height font-medium shrink-0">
                Archive - 요청 기록
              </div>
            </div>

            {archiveItems.length === 0 ? (
              <div className="self-stretch flex flex-col items-center py-12 px-6 gap-4 text-schemes-on-surface-variant">
                <img className="w-16 h-16 opacity-40" alt="" src="/archive.svg" />
                <div className="relative text-[16px] leading-[140%] font-medium font-[Inter] text-center">
                  아직 요청한 해설이 없습니다.
                  <br />
                  영상을 업로드하거나 URL을 입력해보세요.
                </div>
              </div>
            ) : (
              <div className="self-stretch flex flex-col items-center py-0 px-6 gap-3">
                {archiveItems.map((item) => (
                  <div
                    key={item.id}
                    className="self-stretch rounded-xl bg-schemes-surface-container-lowest border-[#e0e0e0] border-solid border-[1px] flex items-center p-4 gap-4 cursor-pointer hover:bg-schemes-surface-container-low transition-colors duration-200"
                    onClick={() => {
                      setCurrentItem(item);
                      if (item.type === "url") {
                        navigate("/view", { state: { audioUrl: item.audioFileName, videoUrl: item.fileName } });
                      } else {
                        navigate("/view", { state: { audioUrl: item.audioFileName, videoUrl: item.fileName } }); // Navigate to /view to play the video directly!
                      }
                    }}
                  >
                    <div className="w-10 h-10 rounded-lg bg-schemes-secondary-container flex items-center justify-center shrink-0">
                      <span className="material-icons text-schemes-on-secondary-container text-[20px]">
                        {item.type === "url" ? "link" : "upload_file"}
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <div className="relative text-[14px] leading-[140%] font-semibold font-[Inter] text-[#1e1e1e] truncate">
                        {item.title}
                      </div>
                      <div className="relative text-[12px] leading-[140%] font-[Inter] text-schemes-on-surface-variant">
                        {item.date} | {item.type === "url" ? "URL" : "파일 업로드"} | {item.audioSize}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="cursor-pointer [border:none] p-2 bg-[transparent] flex items-center justify-center hover:bg-schemes-surface-container rounded-full transition-colors duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(item.id);
                        }}
                        title="좋아요"
                      >
                        <span className="material-icons text-[24px]" style={{ color: item.liked ? "#6750a4" : "#79747e" }}>
                          {item.liked ? "favorite" : "favorite_border"}
                        </span>
                      </button>
                      <button
                        className="cursor-pointer [border:none] p-2 bg-[transparent] flex items-center justify-center hover:bg-schemes-surface-container rounded-full transition-colors duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          const audioUrlFromBackend = item.audioFileName;
                          const downloadUrl = audioUrlFromBackend
                            ? (audioUrlFromBackend.startsWith("http") ? audioUrlFromBackend : `/api/storage/stream?url=${encodeURIComponent(audioUrlFromBackend)}`)
                            : "/dummy_audio.wav";
                          const link = document.createElement("a");
                          link.href = downloadUrl;
                          link.download = item.audioFileName || "smartadv_audio.wav";
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        title="음성 파일 다운로드"
                      >
                        <span className="material-icons text-[24px] text-schemes-on-surface-variant hover:text-schemes-primary transition-colors duration-200">
                          download
                        </span>
                      </button>
                      <button
                        className="cursor-pointer [border:none] p-2 bg-[transparent] flex items-center justify-center hover:bg-schemes-surface-container rounded-full transition-colors duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("정말로 이 기록을 삭제하시겠습니까?\n서버에 저장된 동영상 및 음성 파일도 함께 삭제됩니다.")) {
                            deleteArchiveItem(item.id);
                          }
                        }}
                        title="삭제"
                      >
                        <span className="material-icons text-[24px] text-schemes-on-surface-variant hover:text-[#ba1a1a] transition-colors duration-200">
                          delete
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
    </div>
  );
};

export default Archive;
