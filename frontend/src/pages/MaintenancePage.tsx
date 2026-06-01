import { FunctionComponent, useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";

const MaintenancePage: FunctionComponent = () => {
  const { login } = useAppContext();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleCredentialResponse = async (response: any) => {
    setErrorMsg(null);
    setIsAuthenticating(true);
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
        if (data.user && data.user.role === "ADMIN") {
          login(data.token, data.user);
        } else {
          setErrorMsg("접근 권한 제한: 입력하신 계정은 관리자 권한이 없습니다. 점검 중에는 관리자 계정만 진입이 가능합니다.");
          // Clean up if something was set
          localStorage.removeItem("smartadv_token");
          localStorage.removeItem("smartadv_user");
        }
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "구글 로그인에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("로그인 처리 중 기술적인 오류가 발생했습니다.");
    } finally {
      setIsAuthenticating(false);
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
          document.getElementById("google-maintenance-btn"),
          { theme: "filled_blue", size: "large", width: 280, shape: "pill" }
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
    <div className="w-full min-h-screen relative bg-slate-950 overflow-hidden flex items-center justify-center p-6 select-none font-[Roboto]">
      {/* Decorative blurred glow background elements */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-purple-600/10 rounded-full blur-[140px] pointer-events-none animate-pulse" style={{ animationDuration: '10s' }} />

      <div className="w-full max-w-lg bg-slate-900/60 border border-slate-800/80 backdrop-blur-2xl rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
        {/* Glowing border top */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-purple-500 opacity-60" />

        {/* Dynamic Animated Gear SVG Container */}
        <div className="relative mb-8 flex items-center justify-center">
          <div className="absolute w-24 h-24 bg-blue-500/10 rounded-full blur-xl animate-ping opacity-30" style={{ animationDuration: '3s' }} />
          
          <svg className="w-20 h-20 text-blue-500 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <style>{`
              @keyframes spinSlow {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              .animate-spin-slow {
                animation: spinSlow 12s linear infinite;
              }
            `}</style>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        {/* Typography */}
        <span className="text-[11px] font-bold tracking-widest uppercase text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 mb-4 animate-pulse">
          SYSTEM MAINTENANCE
        </span>
        
        <h1 className="text-3xl font-extrabold text-white tracking-tight leading-none mb-3">
          서비스 점검 중입니다
        </h1>
        
        <p className="text-slate-400 text-sm leading-relaxed max-w-sm mb-8 font-[Inter]">
          보다 안정적이고 정밀한 AI 화면해설 서비스를 제공하기 위해 현재 시스템 정기 점검이 진행되고 있습니다. 잠시 후 이용해 주세요.
        </p>

        {/* Error Banner */}
        {errorMsg && (
          <div className="w-full bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 mb-6 text-left animate-fade-in">
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .animate-fade-in {
                animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
            `}</style>
            <div className="flex gap-3">
              <span className="p-1 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center h-7 w-7 shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <div className="text-xs text-rose-300 font-medium leading-normal flex-1">
                {errorMsg}
              </div>
            </div>
          </div>
        )}

        {/* Google Admin Login Block */}
        <div className="w-full border-t border-slate-800/80 pt-8 mt-4 flex flex-col items-center">
          <div className="text-xs text-slate-500 mb-4 tracking-wide font-medium">
            관리자이신가요? 아래 구글 로그인으로 진입하십시오.
          </div>
          
          <div className="flex items-center justify-center min-h-[50px] relative">
            {isAuthenticating && (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-full">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            )}
            <div id="google-maintenance-btn" className="transition-all hover:scale-[1.02] active:scale-[0.98]"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
