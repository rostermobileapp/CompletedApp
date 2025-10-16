import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PermissionProvider } from "@/context/SubscriptionContext";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AdSenseBanner } from "@/components/AdSenseBanner";
import { PageTransition } from "@/components/PageTransition";
import { SlideOutMenu } from "@/components/SlideOutMenu";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import LeagueSearch from "@/pages/LeagueSearch";
import Teams from "@/pages/Teams";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import UserProfile from "@/pages/UserProfile";
import Subscription from "@/pages/Subscription";
import Roster from "@/pages/Roster";
import CreateLeague from "@/pages/CreateLeague";
import CreateTeam from "@/pages/CreateTeam";
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
import CreatePaymentRequest from "@/pages/CreatePaymentRequest";
import PaymentRequests from "@/pages/PaymentRequests";
import PaymentRequestDetail from "@/pages/PaymentRequestDetail";
import ScoreVerification from "@/pages/ScoreVerification";
import FacilityBrowse from "@/pages/FacilityBrowse";
import FacilityDetail from "@/pages/FacilityDetail";
import FacilityMemberships from "@/pages/FacilityMemberships";
import CreateCalendarEvent from "@/pages/CreateCalendarEvent";
import Privacy from "@/pages/Privacy";

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
        <Route path="/facilities" component={FacilityBrowse} />
        <Route path="/facilities/:id" component={FacilityDetail} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <PermissionProvider>
      <div className="relative min-h-screen w-full">
        <SlideOutMenu />
        <PageTransition>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/league-search" component={LeagueSearch} />
            <Route path="/teams" component={Teams} />
            <Route path="/messages" component={Messages} />
            <Route path="/messages/:conversationId" component={Messages} />
            <Route path="/profile" component={Profile} />
            <Route path="/user/:userId" component={UserProfile} />
            <Route path="/subscription" component={Subscription} />
            <Route path="/roster" component={Roster} />
            <Route path="/create-league" component={CreateLeague} />
            <Route path="/create-team" component={CreateTeam} />
            <Route path="/create-scrimmage" component={CreateScrimmage} />
            <Route path="/scrimmage-management" component={ScrimmageManagement} />
            <Route path="/league-management" component={LeagueManagement} />
            <Route path="/league/:leagueId/score-verification" component={ScoreVerification} />
            <Route path="/league-list" component={LeagueList} />
            <Route path="/calendar" component={Calendar} />
            <Route path="/game/:id" component={GameDetails} />
            <Route path="/scrimmage/:id" component={GameDetails} />
            <Route path="/announcements" component={Announcements} />
            <Route path="/substitute-confirmations" component={SubstituteConfirmations} />
            <Route path="/stats" component={Stats} />
            <Route path="/stats-management" component={StatsManagement} />
            <Route path="/create-payment-request" component={CreatePaymentRequest} />
            <Route path="/payment-requests" component={PaymentRequests} />
            <Route path="/payment-requests/:id" component={PaymentRequestDetail} />
            <Route path="/facilities" component={FacilityBrowse} />
            <Route path="/facilities/:id" component={FacilityDetail} />
            <Route path="/facility-memberships" component={FacilityMemberships} />
            <Route path="/calendar-events/create" component={CreateCalendarEvent} />
            <Route path="/privacy" component={Privacy} />
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
        <AdSenseBanner />
        <BottomNavigation />
      </div>
    </PermissionProvider>
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
