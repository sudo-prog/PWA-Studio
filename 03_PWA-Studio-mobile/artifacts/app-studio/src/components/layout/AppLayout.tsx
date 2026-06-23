import { useEffect } from "react";
import { useOffline } from "@/hooks/use-offline";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FolderKanban, 
  Settings as SettingsIcon,
  WifiOff
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isOffline = useOffline();
  const { drainQueue } = useOfflineQueue();
  const [location] = useLocation();

  // Drain queued mutations when we come back online
  useEffect(() => {
    if (!isOffline) {
      drainQueue().catch(console.error);
    }
  }, [isOffline, drainQueue]);

  // Also drain on SW background-sync signal
  useEffect(() => {
    const handler = () => drainQueue().catch(console.error);
    window.addEventListener("sw-sync-agent-queue", handler);
    return () => window.removeEventListener("sw-sync-agent-queue", handler);
  }, [drainQueue]);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      {isOffline && (
        <div className="bg-amber-500/90 text-white px-4 py-2 text-sm flex items-center justify-center gap-2 backdrop-blur-md z-50 sticky top-0 font-medium">
          <WifiOff className="h-4 w-4" />
          <span>Limited Mode — Canvas and Kanban available offline. Agent features resume when reconnected.</span>
        </div>
      )}
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border glass-panel hidden md:flex flex-col flex-shrink-0 z-40 relative">
          <div className="p-6">
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">APP Studio</h1>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 cursor-pointer",
                    isActive 
                      ? "bg-primary/10 text-primary font-medium shadow-sm" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground hover-elevate"
                  )}>
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none -z-10" />
          <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}