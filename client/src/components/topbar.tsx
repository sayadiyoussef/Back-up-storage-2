import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Bell, Menu } from "lucide-react";

export default function TopBar() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => date.toISOString().substr(11, 8) + " UTC";

  return (
    <header className="bg-trading-slate border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-gray-400 hover:bg-gray-700"
          data-testid="button-mobile-menu"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="flex items-center space-x-6">
          {/* Market Status */}
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-trading-green rounded-full animate-pulse" />
            <span className="text-sm font-medium text-gray-300" data-testid="market-status">
              Market Open
            </span>
          </div>

          {/* Current Time */}
          <div className="text-sm text-gray-400 font-mono" data-testid="current-time">
            {formatTime(currentTime)}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search grades..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 pl-10 w-64"
              data-testid="input-search"
            />
          </div>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative text-gray-400 hover:text-white hover:bg-gray-700"
            data-testid="button-notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-trading-red rounded-full" />
          </Button>
        </div>
      </div>
    </header>
  );
}
