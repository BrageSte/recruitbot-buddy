import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Briefcase, FileText, User, LogOut, Sparkles, Rss, FileCog, Search, CalendarDays, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useState } from "react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/jobs", label: "Jobber", icon: Briefcase },
  { to: "/applications", label: "Søknader", icon: FileText },
  { to: "/calendar", label: "Kalender", icon: CalendarDays },
  { to: "/sources", label: "Kilder", icon: Rss },
  { to: "/auto-search", label: "Auto-søk", icon: Search },
  { to: "/cv", label: "CV-mal", icon: FileCog },
  { to: "/profile", label: "Profil", icon: User },
];

interface SidebarContentProps {
  email?: string;
  onSignOut: () => void;
  onNavigate?: () => void;
}

const SidebarContent = ({ email, onSignOut, onNavigate }: SidebarContentProps) => (
  <div className="flex flex-col h-full">
    <div className="p-5 flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-elevated">
        <Sparkles className="w-4 h-4 text-primary-foreground" />
      </div>
      <div>
        <div className="font-semibold text-sm leading-tight">JobHunter</div>
        <div className="text-[11px] text-muted-foreground leading-tight">AI</div>
      </div>
    </div>

    <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )
          }
        >
          <Icon className="w-4 h-4" />
          {label}
        </NavLink>
      ))}
    </nav>

    <div className="p-3 border-t border-sidebar-border">
      <div className="text-xs text-muted-foreground px-2 mb-2 truncate">{email}</div>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onSignOut}>
        <LogOut className="w-4 h-4 mr-2" />
        Logg ut
      </Button>
    </div>
  </div>
);

export const AppLayout = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen md:flex bg-gradient-subtle">
      {/* Desktop sidebar — sticky */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-sidebar-border bg-sidebar sticky top-0 h-screen">
        <SidebarContent email={user?.email} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 px-4 h-14 border-b border-sidebar-border bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/75">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center shadow-elevated">
            <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div className="font-semibold text-sm">JobHunter AI</div>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Åpne meny">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
            <SidebarContent
              email={user?.email}
              onSignOut={() => {
                setMobileOpen(false);
                handleSignOut();
              }}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </header>

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
};
