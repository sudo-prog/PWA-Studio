import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  Puzzle,
  Settings,
  Cpu,
  ChevronRight,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/projects", icon: FolderOpen, label: "Projects" },
  { href: "/widgets", icon: Puzzle, label: "Widget Registry" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function AppLayout({ children, title, breadcrumbs }: AppLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground" data-testid="app-layout">
      {/* Sidebar */}
      <aside className="flex flex-col w-14 border-r border-border bg-sidebar shrink-0" data-testid="sidebar">
        <div className="flex items-center justify-center h-12 border-b border-sidebar-border">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/" data-testid="link-logo">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary text-primary-foreground">
                  <Cpu className="w-4 h-4" />
                </div>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">PWA Studio</TooltipContent>
          </Tooltip>
        </div>

        <nav className="flex flex-col items-center gap-1 py-3 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? location === "/"
                : location.startsWith(item.href);
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link href={item.href} data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    <div
                      className={cn(
                        "flex items-center justify-center w-9 h-9 rounded-md transition-colors",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <Separator className="bg-sidebar-border" />
        <div className="h-4" />
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        {(title || breadcrumbs) && (
          <header className="flex items-center h-12 px-4 border-b border-border shrink-0 gap-2" data-testid="page-header">
            {breadcrumbs ? (
              <nav className="flex items-center gap-1 text-sm">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                    {crumb.href ? (
                      <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-foreground font-medium">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            ) : (
              <h1 className="text-sm font-semibold text-foreground">{title}</h1>
            )}
          </header>
        )}

        {/* Content */}
        <main className="flex-1 overflow-auto" data-testid="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
