import { FunctionComponent, useEffect } from "react";
import NavigationRail from "../components/NavigationRail";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

const Login: FunctionComponent = () => {
  const navigate = useNavigate();
  const { login } = useAppContext();

  const handleCredentialResponse = async (response: any) => {
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ credential: response.credential })
      });
      if (res.ok) {
        const data = await res.json();
        login(data.token, data.user);
        navigate("/");
      } else {
        const err = await res.json();
        alert(err.error || "구글 로그인에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("로그인 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "707400599606-egvev8ntmg5tost1e6ijhevqm3um3hgq.apps.googleusercontent.com";
    
    const initializeGoogle = () => {
      if ((window as any).google) {
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse
        });
        (window as any).google.accounts.id.renderButton(
          document.getElementById("google-login-btn"),
          { theme: "outline", size: "large", width: 280 }
        );
      }
    };

    const checkInterval = setInterval(() => {
      if ((window as any).google) {
        initializeGoogle();
        clearInterval(checkInterval);
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, []);

  return (
    <div className="w-full min-h-screen relative bg-schemes-surface overflow-hidden flex flex-col items-start py-0 px-[13px] box-border leading-[normal] tracking-[normal]">
      <main className="self-stretch flex-1 flex items-start justify-between py-[5px] px-0 gap-0 text-left text-[16px] text-[#000] font-[Roboto]">
          <NavigationRail
            iconContainerBorder="none"
            iconContainerPadding="0"
            archiveIconBorder="unset"
            archiveIconPadding="unset"
            archiveIconBackgroundColor="unset"
            iconBorder="unset"
            iconPadding="unset"
            iconBackgroundColor="unset"
            starFilledIconBorder="unset"
            starFilledIconPadding="unset"
            starFilledIconBackgroundColor="unset"
            settingsIconBorder="unset"
            settingsIconPadding="unset"
            settingsIconBackgroundColor="unset"
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
          <div className="self-stretch flex-1 rounded-xl bg-schemes-on-primary flex flex-col items-center py-16 px-0 gap-8 justify-center mq675:pt-10 mq675:pb-10 mq675:box-border">
            <div className="self-stretch flex flex-col items-center py-0 px-6 gap-2 text-static-display-small-size text-schemes-on-surface">
              <h1 className="m-0 relative text-[length:inherit] leading-static-display-small-line-height font-medium font-[inherit] shrink-0 mq450:text-[22px] mq450:leading-[26px] mq750:text-[29px] mq750:leading-[35px]">
                SmartADV
              </h1>
            </div>
            <div className="self-stretch h-[27px] flex flex-col items-center py-0 px-6 box-border gap-2 text-schemes-on-surface-variant">
              <div className="relative leading-static-display-small-line-height font-medium shrink-0">
                AI기반 화면해설 방송 자동 생성 솔루션
              </div>
            </div>
            <section className="self-stretch flex flex-col items-center justify-center py-8 px-[75px] gap-6 text-center">
              <div className="relative text-[16px] leading-[140%] font-[Inter] text-[#6b7280] max-w-[320px]">
                서비스 이용을 위해 구글 계정으로 로그인해 주세요.
              </div>
              <div className="flex items-center justify-center min-h-[50px]">
                <div id="google-login-btn"></div>
              </div>
              <div className="flex items-center justify-center gap-2 text-[14px] font-[Inter] mt-4">
                <span className="text-schemes-on-surface-variant">계정이 없으신가요?</span>
                <button
                  className="cursor-pointer [border:none] bg-[transparent] p-0 text-[14px] font-semibold font-[Inter] text-[#6750a4] underline"
                  onClick={() => navigate("/register")}
                >
                  구글 계정으로 가입
                </button>
              </div>
            </section>
          </div>
        </main>
    </div>
  );
};

export default Login;
