import { createContext, useContext, useState, useEffect, ReactNode, FunctionComponent } from "react";

export type ArchiveItem = {
  id: string;
  title: string;
  type: "url" | "file";
  url?: string;
  fileName?: string;
  audioFileName: string;
  audioSize: string;
  date: string;
  liked: boolean;
};

export type UserProfile = {
  id: number;
  email: string;
  name: string;
  picture: string;
  role: string;
};

type AppContextType = {
  archiveItems: ArchiveItem[];
  addArchiveItem: (item: Omit<ArchiveItem, "id" | "date" | "liked" | "audioFileName" | "audioSize">) => ArchiveItem;
  toggleLike: (id: string) => void;
  currentItem: ArchiveItem | null;
  setCurrentItem: (item: ArchiveItem | null) => void;
  user: UserProfile | null;
  token: string | null;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  fetchArchive: () => Promise<void>;
  deleteArchiveItem: (id: string) => Promise<void>;
  isLoadingArchive: boolean;
  isMaintenanceMode: boolean;
  isLoadingMaintenance: boolean;
  checkMaintenance: () => Promise<void>;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: FunctionComponent<{ children: ReactNode }> = ({ children }) => {
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);
  const [currentItem, setCurrentItem] = useState<ArchiveItem | null>(null);
  
  // Auth state
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);

  // Maintenance state
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(true);

  const checkMaintenance = async () => {
    try {
      const res = await fetch("/api/maintenance/status");
      if (res.ok) {
        const data = await res.json();
        setIsMaintenanceMode(data.enabled);
      }
    } catch (e) {
      console.error("Failed to check maintenance status", e);
    } finally {
      setIsLoadingMaintenance(false);
    }
  };

  // Initialize auth from localStorage and check maintenance
  useEffect(() => {
    const savedToken = localStorage.getItem("smartadv_token");
    const savedUser = localStorage.getItem("smartadv_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    checkMaintenance();
  }, []);

  // Fetch archive whenever token is loaded/changed
  useEffect(() => {
    if (token) {
      fetchArchive();
    } else {
      setArchiveItems([]);
    }
  }, [token]);

  const login = (newToken: string, newUser: UserProfile) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("smartadv_token", newToken);
    localStorage.setItem("smartadv_user", JSON.stringify(newUser));
  };

  const logout = () => {
    // Notify backend asynchronously
    if (token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }).catch((e) => console.error("Backend logout failed", e));
    }

    setToken(null);
    setUser(null);
    setArchiveItems([]);
    setCurrentItem(null);
    localStorage.removeItem("smartadv_token");
    localStorage.removeItem("smartadv_user");
  };

  const fetchArchive = async () => {
    if (!token) return;
    setIsLoadingArchive(true);
    try {
      const res = await fetch("/api/archive", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setArchiveItems(data);
      } else if (res.status === 401) {
        logout(); // Auto logout on invalid token
      }
    } catch (e) {
      console.error("Failed to fetch archive", e);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  const addArchiveItem = (item: Omit<ArchiveItem, "id" | "date" | "liked" | "audioFileName" | "audioSize">) => {
    const newItem: ArchiveItem = {
      ...item,
      id: Date.now().toString(),
      date: new Date().toLocaleString("ko-KR"),
      liked: false,
      audioFileName: "smartadv_audio.wav",
      audioSize: "12MB",
    };
    // Note: We can also sync with backend archive list immediately, or wait for next fetch
    setArchiveItems((prev) => [newItem, ...prev]);
    setCurrentItem(newItem);
    return newItem;
  };

  const toggleLike = async (id: string) => {
    if (!token) return;
    const targetItem = archiveItems.find((item) => item.id === id);
    if (!targetItem) return;
    const originalLiked = targetItem.liked;
    const newLiked = !originalLiked;

    // Optimistic Update
    setArchiveItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, liked: newLiked } : item
      )
    );

    try {
      const res = await fetch(`/api/archive/${id}/like?liked=${newLiked}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error("Failed to save liked state on backend");
      }
    } catch (e) {
      console.error("Failed to toggle like", e);
      // Rollback on failure
      setArchiveItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, liked: originalLiked } : item
        )
      );
    }
  };

  const deleteArchiveItem = async (id: string) => {
    if (!token) return;
    const targetItem = archiveItems.find((item) => item.id === id);
    if (!targetItem) return;

    // Optimistic Update
    setArchiveItems((prev) => prev.filter((item) => item.id !== id));
    if (currentItem?.id === id) {
      setCurrentItem(null);
    }

    try {
      const res = await fetch(`/api/archive/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error("Failed to delete archive item on backend");
      }
    } catch (e) {
      console.error("Failed to delete archive item", e);
      // Fetch archive again to restore consistency on failure
      fetchArchive();
    }
  };

  return (
    <AppContext.Provider value={{
      archiveItems,
      addArchiveItem,
      toggleLike,
      currentItem,
      setCurrentItem,
      user,
      token,
      login,
      logout,
      fetchArchive,
      deleteArchiveItem,
      isLoadingArchive,
      isMaintenanceMode,
      isLoadingMaintenance,
      checkMaintenance
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
};
