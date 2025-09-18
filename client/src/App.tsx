import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { BottomNavigation } from "@/components/BottomNavigation";
import { PageTransition } from "@/components/PageTransition";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import LeagueSearch from "@/pages/LeagueSearch";
import Teams from "@/pages/Teams";
import Messages from "@/pages/Messages";
import More from "@/pages/More";
import Profile from "@/pages/Profile";
import Roster from "@/pages/Roster";
import Subscription from "@/pages/Subscription";
import CreateLeague from "@/pages/CreateLeague";
import CreateScrimmage from "@/pages/CreateScrimmage";
import ScrimmageManagement from "@/pages/ScrimmageManagement";
import LeagueManagement from "@/pages/LeagueManagement";
import LeagueList from "@/pages/LeagueList";
import Calendar from "@/pages/Calendar";
import GameDetails from "@/pages/GameDetails";
import Announcements from "@/pages/Announcements";
import SubstituteConfirmations from "@/pages/SubstituteConfirmations";
import Stats from "@/pages/Stats";
import StatsManagement from "@/pages/StatsManagement";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="loading-app">
        <div className="animate-pulse">
          <div className="text-2xl font-bold text-primary">Rosters</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <SubscriptionProvider>
      <div className="relative min-h-screen w-full">
        <PageTransition>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/league-search" component={LeagueSearch} />
            <Route path="/teams" component={Teams} />
            <Route path="/messages" component={Messages} />
            <Route path="/more" component={More} />
            <Route path="/profile" component={Profile} />
            <Route path="/roster" component={Roster} />
            <Route path="/subscription" component={Subscription} />
            <Route path="/create-league" component={CreateLeague} />
            <Route path="/create-scrimmage" component={CreateScrimmage} />
            <Route path="/scrimmage-management" component={ScrimmageManagement} />
            <Route path="/league-management" component={LeagueManagement} />
            <Route path="/league-list" component={LeagueList} />
            <Route path="/calendar" component={Calendar} />
            <Route path="/game/:id" component={GameDetails} />
            <Route path="/scrimmage/:id" component={GameDetails} />
            <Route path="/announcements" component={Announcements} />
            <Route path="/substitute-confirmations" component={SubstituteConfirmations} />
            <Route path="/stats" component={Stats} />
            <Route path="/stats-management" component={StatsManagement} />
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
        <BottomNavigation />
      </div>
    </SubscriptionProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
