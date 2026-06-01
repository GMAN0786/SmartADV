import { useEffect } from "react";
import {
  Routes,
  Route,
  useNavigationType,
  useLocation,
  Navigate,
} from "react-router-dom";
import DragDrop from "./pages/DragDrop";
import View from "./pages/View";
import Download from "./pages/Download";
import Main from "./pages/Main";
import ProgressPage from "./pages/ProgressPage";
import Registeration from "./pages/Registeration";
import Login from "./pages/Login";
import Archive from "./pages/Archive";
import Likes from "./pages/Likes";
import { useAppContext } from "./context/AppContext";
import MaintenancePage from "./pages/MaintenancePage";

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { token } = useAppContext();
  const savedToken = token || localStorage.getItem("smartadv_token");
  if (!savedToken) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  const action = useNavigationType();
  const location = useLocation();
  const pathname = location.pathname;
  const { isMaintenanceMode, isLoadingMaintenance, user } = useAppContext();

  useEffect(() => {
    if (action !== "POP") {
      window.scrollTo(0, 0);
    }
  }, [action, pathname]);

  useEffect(() => {
    let title = "";
    let metaDescription = "";

    switch (pathname) {
      case "/":
        title = "SmartADV - Upload";
        metaDescription = "AI기반 화면해설 방송 자동 생성 솔루션";
        break;
      case "/url":
      case "/examplesmain":
        title = "SmartADV - URL Input";
        metaDescription = "URL로 영상 해설 생성";
        break;
      case "/view":
      case "/examplesview":
        title = "SmartADV - View";
        metaDescription = "영상 시청";
        break;
      case "/download":
      case "/examplesdownload":
        title = "SmartADV - Download";
        metaDescription = "해설 오디오 다운로드";
        break;
      case "/login":
      case "/exampleslogin":
        title = "SmartADV - Login";
        metaDescription = "로그인";
        break;
      case "/register":
      case "/examplesregisteration":
        title = "SmartADV - Register";
        metaDescription = "회원가입";
        break;
      case "/archive":
        title = "SmartADV - Archive";
        metaDescription = "요청 기록";
        break;
      case "/likes":
        title = "SmartADV - Likes";
        metaDescription = "좋아요 목록";
        break;
    }

    if (title) {
      document.title = title;
    }

    if (metaDescription) {
      const metaDescriptionTag: HTMLMetaElement | null = document.querySelector(
        'head > meta[name="description"]',
      );
      if (metaDescriptionTag) {
        metaDescriptionTag.content = metaDescription;
      }
    }
  }, [pathname]);

  if (isLoadingMaintenance) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0f172a] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="text-sm font-medium tracking-wide text-slate-400 font-[Inter]">Loading SmartADV...</p>
        </div>
      </div>
    );
  }

  if (isMaintenanceMode && (!user || user.role !== "ADMIN")) {
    return <MaintenancePage />;
  }

  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><DragDrop /></ProtectedRoute>} />
      <Route path="/url" element={<ProtectedRoute><Main /></ProtectedRoute>} />
      <Route path="/progress" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
      <Route path="/view" element={<ProtectedRoute><View /></ProtectedRoute>} />
      <Route path="/download" element={<ProtectedRoute><Download /></ProtectedRoute>} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Registeration />} />
      <Route path="/archive" element={<ProtectedRoute><Archive /></ProtectedRoute>} />
      <Route path="/likes" element={<ProtectedRoute><Likes /></ProtectedRoute>} />
      {/* Legacy routes for backward compatibility */}
      <Route path="/examplesview" element={<ProtectedRoute><View /></ProtectedRoute>} />
      <Route path="/examplesdownload" element={<ProtectedRoute><Download /></ProtectedRoute>} />
      <Route path="/examplesmain" element={<ProtectedRoute><Main /></ProtectedRoute>} />
      <Route path="/examplesregisteration" element={<Registeration />} />
      <Route path="/exampleslogin" element={<Login />} />
    </Routes>
  );
}
export default App;
