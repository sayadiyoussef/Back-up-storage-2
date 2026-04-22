// client/src/App.tsx
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "./hooks/useAuth";

// Pages
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Market from "@/pages/market";
import Chat from "@/pages/chat";
import Analytics from "@/pages/analytics";
import Fixings from "@/pages/fixings";
import Navires from "@/pages/navires";
import Knowledge from "@/pages/knowledge";
import Grades from "@/pages/grades";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

// ✅ NEW: pages Produits, Clients & Contrats
import Products from "@/pages/products";
import Clients from "@/pages/clients";
import Contracts from "@/pages/contracts";

// Un simple garde : si pas loggé => Landing
function Protected({ component: Cmp }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Cmp /> : <Landing />;
}

function Router() {
  const { isAuthenticated } = useAuth();

  return (
    <Switch>
      {/* Racine : Dashboard si loggé, sinon Landing */}
      <Route path="/" component={isAuthenticated ? Dashboard : Landing} />

      {/* Routes protégées */}
      <Route path="/dashboard" component={() => <Protected component={Dashboard} />} />
      <Route path="/market" component={() => <Protected component={Market} />} />
      <Route path="/chat" component={() => <Protected component={Chat} />} />
      <Route path="/grades" component={() => <Protected component={Grades} />} />
      <Route path="/analytics" component={() => <Protected component={Analytics} />} />
      <Route path="/fixings" component={() => <Protected component={Fixings} />} />
      <Route path="/navires" component={() => <Protected component={Navires} />} />
      <Route path="/products" component={() => <Protected component={Products} />} />
      <Route path="/clients" component={() => <Protected component={Clients} />} />
      <Route path="/contracts" component={() => <Protected component={Contracts} />} />
      <Route path="/knowledge" component={() => <Protected component={Knowledge} />} />
      <Route path="/settings" component={() => <Protected component={Settings} />} />

      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="dark">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
