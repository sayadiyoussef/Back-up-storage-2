import Sidebar from "@/components/sidebar";
import TopBar from "@/components/topbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";

export default function Settings() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.name || "");

  useEffect(() => { setDisplayName(user?.name || ""); }, [user?.name]);

  const save = () => {
    try {
      const raw = localStorage.getItem("auth");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      parsed.user = { ...parsed.user, name: displayName };
      localStorage.setItem("auth", JSON.stringify(parsed));
      alert("Settings saved.");
    } catch {}
  };

  return (
    <div className="min-h-screen bg-trading-dark text-white">
      <div className="flex">
        <Sidebar />
        <main className="flex-1">
          <TopBar />
          <div className="p-6 space-y-6">
            <Card className="bg-gray-900 border-gray-700 max-w-2xl">
              <CardHeader>
                <CardTitle className="text-white">Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Display name</Label>
                  <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={save} className="bg-trading-blue hover:bg-trading-blue/80">Save</Button>
                </div>
                <p className="text-xs text-gray-400">Préférences stockées côté navigateur (local).</p>
                <div className="space-y-2">
    <Label>Theme</Label>
    <select
      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-40"
      onChange={(e)=>{
        const t = e.target.value;
        localStorage.setItem("theme", t);
        const root = document.documentElement;
        if (t==="dark") root.classList.add("dark"); else root.classList.remove("dark");
      }}
      defaultValue={typeof window !== "undefined" ? (localStorage.getItem("theme") || "dark") : "dark"}
    >
      <option value="dark">Dark</option>
      <option value="light">Light</option>
    </select>
  </div>
</CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
