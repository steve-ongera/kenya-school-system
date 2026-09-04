// components/AppLayout.jsx
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useSidebar } from "../hooks/useSidebar";

export default function AppLayout() {
  const { isDesktop, collapsed, mobileOpen, toggleSidebar, closeMobileSidebar } = useSidebar();

  return (
    <div className="app-shell">
      <Sidebar
        isDesktop={isDesktop}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onClose={closeMobileSidebar}
      />
      <div className="app-shell__main">
        <Navbar onToggleSidebar={toggleSidebar} />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}