import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Droplets } from "lucide-react";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return; // anti double-submit
    setIsLoading(true);

    try {
      await login(email, password);
      toast({ title: "Login successful", description: "Welcome to OilTracker" });
      // Redirection robuste (SPA ou SSR), sans conserver /login dans l'historique
      window.location.replace("/");
    } catch (error) {
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      // Toujours revenir à l'état normal si la page n'a pas été remplacée
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-trading-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-trading-blue to-blue-500 rounded-xl flex items-center justify-center">
              <Droplets className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">OilTracker</h1>
          </div>
          <p className="text-gray-400">Professional Oil Trading Platform</p>
        </div>

        <Card className="bg-trading-slate border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Sign In</CardTitle>
            <CardDescription className="text-gray-400">
              Enter your credentials to access the trading platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  required
                  data-testid="input-email"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  required
                  data-testid="input-password"
                  autoComplete="current-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-trading-blue hover:bg-blue-600 text-white"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-400 mb-2">Demo Accounts:</p>
              <div className="space-y-1 text-xs text-gray-300">
                <p><strong>Admin:</strong> y.sayadi@direct-medical.net / admin123</p>
                <p><strong>Senior:</strong> senior@oiltracker.com / senior123</p>
                <p><strong>Junior:</strong> junior@oiltracker.com / junior123</p>
                <p><strong>Viewer:</strong> viewer@oiltracker.com / viewer123</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
