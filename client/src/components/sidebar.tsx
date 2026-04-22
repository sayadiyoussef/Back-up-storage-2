// src/components/sidebar.tsx
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BarChart3,
  MessageSquare,
  TrendingUp,
  Layers,
  Settings,
  LogOut,
  Droplets,
  Package,   // Products
  Users,     // Clients
  FileText,  // ✅ NEW: Contrats
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Fixings", href: "/fixings", icon: Droplets },
  { name: "Navires", href: "/navires", icon: Droplets },
  // ✅ placé juste après Navires
  { name: "Products", href: "/products", icon: Package },
  // ✅ Clients
  { name: "Clients", href: "/clients", icon: Users },
  // ✅ NEW: Contrats juste après Clients
  { name: "Contrats", href: "/contracts", icon: FileText },
  { name: "Base de connaissance", href: "/knowledge", icon: Layers },
  { name: "Market Data", href: "/market", icon: TrendingUp },
  { name: "Oil Grades", href: "/grades", icon: Layers },
  { name: "Team Chat", href: "/chat", icon: MessageSquare },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const getAvatarUrl = () => {
    const avatars = [
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
      "https://images.unsplash.com/photo-1494790108755-2616b612b1e9?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&w=150&h=150&fit=crop&crop=face",
    ];
    if (!user) return avatars[0];
    const index = user.name.length % avatars.length;
    return avatars[index];
  };

  const getInitials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").toUpperCase();

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "text-trading-blue";
      case "senior": return "text-trading-green";
      case "junior": return "text-trading-amber";
      default: return "text-gray-400";
    }
  };

  const handleLogout = async () => {
    try { if (typeof logout === "function") await Promise.resolve(logout()); } catch {}
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
    } catch {}
    setLocation("/");
    setTimeout(() => { if (typeof window !== "undefined") window.location.replace("/"); }, 0);
  };

  return (
    <div className="hidden md:flex md:flex-shrink-0">
      <aside className="flex flex-col w-64 h-screen bg-trading-slate border-r border-gray-700">
        <div className="flex items-center px-6 py-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-trading-blue to-blue-500 rounded-lg flex items-center justify-center">
              <Droplets className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">OilTracker</h1>
          </div>
        </div>

        {user && (
          <div className="px-4 py-4 border-b border-gray-700">
            <div className="flex items-center space-x-3" data-testid="user-profile">
              <Avatar>
                <AvatarImage src={getAvatarUrl()} alt={user.name} />
                <AvatarFallback className="bg-gray-700 text-gray-300">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-sm font-medium text-white" data-testid="user-name">{user.name}</p>
                <p className={`text-xs font-medium capitalize ${getRoleBadgeColor(user.role)}`} data-testid="user-role">
                  {user.role}
                </p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          {navigation.map(item => {
            const isActive = location === item.href || (location === "/" && item.href === "/dashboard");
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                onClick={() => setLocation(item.href)}
                className={`flex items-center space-x-3 w-full px-3 py-2 rounded-lg transition-colors text-left ${
                  isActive ? "bg-trading-blue/20 text-trading-blue" : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
                data-testid={`nav-${item.name.toLowerCase().replace(" ", "-")}`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
                {item.name === "Team Chat" && (
                  <span className="ml-auto bg-trading-red text-white text-xs rounded-full px-2 py-1">3</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700 sticky bottom-0 bg-trading-slate z-10">
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="flex items-center space-x-3 w-full justify-start px-3 py-2 text-gray-400 hover:bg-gray-700 hover:text-white"
            data-testid="button-logout"
            aria-label="Logout"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </Button>
        </div>
      </aside>
    </div>
  );
}
