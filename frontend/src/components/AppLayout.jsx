// components/AppLayout.jsx
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { useSidebar } from "../hooks/useSidebar";
import { LicenseProvider } from "../context/LicenseContext";
import LicenseLockOverlay from "./LicenseLockOverlay";

export default function AppLayout() {
  const { isDesktop, collapsed, mobileOpen, toggleSidebar, closeMobileSidebar } = useSidebar();

  return (
    <LicenseProvider>
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
            <LicenseLockOverlay>
              <Outlet />
            </LicenseLockOverlay>
          </main>
        </div>
      </div>
    </LicenseProvider>
  );
}