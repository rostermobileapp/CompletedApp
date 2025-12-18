import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PermissionProvider } from "@/context/SubscriptionContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { BottomNavigation } from "@/components/BottomNavigation";
import { HPIBBanner } from "@/components/HPIBBanner";
import { PageTransition } from "@/components/PageTransition";
import { SlideOutMenu } from "@/components/SlideOutMenu";
import { ScrollToTop } from "@/components/ScrollToTop";
import { useAuth } from "@/hooks/useAuth";
import { NativelyNotificationsInitializer } from "@/components/NativelyNotificationsInitializer";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Waitlist from "@/pages/Waitlist";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import LeagueSearch from "@/pages/LeagueSearch";
import TeamSearch from "@/pages/TeamSearch";
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
import InviteGroups from "@/pages/InviteGroups";
import EditInviteGroup from "@/pages/EditInviteGroup";
import LeagueManagement from "@/pages/LeagueManagement";
import LeagueList from "@/pages/LeagueList";
import Calendar from "@/pages/Calendar";
import GameDetails from "@/pages/GameDetails";
import Announcements from "@/pages/Announcements";
import SubstituteConfirmations from "@/pages/SubstituteConfirmations";
import Stats from "@/pages/Stats";
import StatsManagement from "@/pages/StatsManagement";
import ScorekeeperDashboard from "@/pages/ScorekeeperDashboard";
import CreatePaymentRequest from "@/pages/CreatePaymentRequest";
import PaymentRequests from "@/pages/PaymentRequests";
import PaymentRequestDetail from "@/pages/PaymentRequestDetail";
import ScoreVerification from "@/pages/ScoreVerification";
import FacilityBrowse from "@/pages/FacilityBrowse";
import FacilityDetail from "@/pages/FacilityDetail";
import FacilityMemberships from "@/pages/FacilityMemberships";
import CreateCalendarEvent from "@/pages/CreateCalendarEvent";
import Privacy from "@/pages/Privacy";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import StripeAdmin from "@/pages/StripeAdmin";
import Tournaments from "@/pages/Tournaments";
import TournamentsLanding from "@/pages/TournamentsLanding";
import TournamentCreate from "@/pages/TournamentCreate";
import TournamentCreateStandalone from "@/pages/TournamentCreateStandalone";
import TournamentDetail from "@/pages/TournamentDetail";
import TournamentEdit from "@/pages/TournamentEdit";
import TournamentSearch from "@/pages/TournamentSearch";
import TournamentTeams from "@/pages/TournamentTeams";
import LeagueTournamentSearch from "@/pages/LeagueTournamentSearch";
import CustomBracketBuilderPage from "@/pages/CustomBracketBuilderPage";
import MediaGalleryPage from "@/pages/MediaGallery";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  // Always render password reset pages standalone, regardless of auth state
  if (location === '/reset-password') {
    return <ResetPassword />;
  }

  if (location === '/forgot-password') {
    return <ForgotPassword />;
  }

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
        <Route path="/waitlist" component={Waitlist} />
        <Route path="/login" component={Login} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/terms-of-service" component={TermsOfService} />
        <Route path="/facilities" component={FacilityBrowse} />
        <Route path="/facilities/:id" component={FacilityDetail} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <PermissionProvider>
      <ScrollToTop />
      <NativelyNotificationsInitializer />
      <div className="relative min-h-screen w-full">
        <SlideOutMenu />
        <PageTransition>
            <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/league-tournament-search" component={LeagueTournamentSearch} />
            <Route path="/league-search" component={LeagueSearch} />
            <Route path="/team-search" component={TeamSearch} />
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
            <Route path="/invite-groups" component={InviteGroups} />
            <Route path="/invite-groups/new" component={EditInviteGroup} />
            <Route path="/invite-groups/:id" component={EditInviteGroup} />
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
            <Route path="/scorekeeper" component={ScorekeeperDashboard} />
            <Route path="/create-payment-request" component={CreatePaymentRequest} />
            <Route path="/payment-requests" component={PaymentRequests} />
            <Route path="/payment-requests/:id" component={PaymentRequestDetail} />
            <Route path="/facilities" component={FacilityBrowse} />
            <Route path="/facilities/:id" component={FacilityDetail} />
            <Route path="/facility-memberships" component={FacilityMemberships} />
            <Route path="/calendar-events/create" component={CreateCalendarEvent} />
            <Route path="/tournaments" component={TournamentsLanding} />
            <Route path="/tournament-search" component={TournamentSearch} />
            <Route path="/tournaments/create" component={TournamentCreateStandalone} />
            <Route path="/leagues/:leagueId/tournaments/create" component={TournamentCreate} />
            <Route path="/leagues/:leagueId/tournaments" component={Tournaments} />
            <Route path="/tournaments/:tournamentId/edit" component={TournamentEdit} />
            <Route path="/tournaments/:tournamentId/custom-builder" component={CustomBracketBuilderPage} />
            <Route path="/tournament-teams/:tournamentId" component={TournamentTeams} />
            <Route path="/tournaments/:tournamentId" component={TournamentDetail} />
            <Route path="/media/tournament/:id" component={MediaGalleryPage} />
            <Route path="/media/league/:id" component={MediaGalleryPage} />
            <Route path="/media/team/:id" component={MediaGalleryPage} />
            <Route path="/privacy" component={Privacy} />
            <Route path="/privacy-policy" component={PrivacyPolicy} />
            <Route path="/terms-of-service" component={TermsOfService} />
            <Route path="/admin/stripe" component={StripeAdmin} />
            <Route component={Dashboard} />
          </Switch>
        </PageTransition>
          <HPIBBanner placement="bottom-nav" />
          <BottomNavigation />
        </div>
    </PermissionProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
