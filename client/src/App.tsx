import { Switch, Route, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PermissionProvider } from "@/context/SubscriptionContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { BottomNavigation } from "@/components/BottomNavigation";
import { HPIBBanner } from "@/components/HPIBBanner";
import { PageTransition } from "@/components/PageTransition";
import { SlideOutMenu } from "@/components/SlideOutMenu";
import { SwipeableMainScreens } from "@/components/SwipeableMainScreens";
import { ScrollToTop } from "@/components/ScrollToTop";
import { SlideUpOverlayProvider } from "@/components/SlideUpOverlay";
import { useAuth } from "@/hooks/useAuth";
import { useAppDataPrefetch } from "@/hooks/useAppDataPrefetch";
import { NativelyNotificationsInitializer } from "@/components/NativelyNotificationsInitializer";
import { WebSocketProvider } from "@/context/WebSocketContext";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Pricing from "@/pages/Pricing";
import About from "@/pages/About";
import SportLanding from "@/pages/SportLanding";
import SegmentLanding from "@/pages/SegmentLanding";
import Waitlist from "@/pages/Waitlist";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import LeagueSearch from "@/pages/LeagueSearch";
import TeamSearch from "@/pages/TeamSearch";
import Messages from "@/pages/Messages";
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
import PaymentRequestDetail from "@/pages/PaymentRequestDetail";
import ScoreVerification from "@/pages/ScoreVerification";
import FacilityBrowse from "@/pages/FacilityBrowse";
import FacilityDetail from "@/pages/FacilityDetail";
import FacilityMemberships from "@/pages/FacilityMemberships";
import CreateCalendarEvent from "@/pages/CreateCalendarEvent";
import Privacy from "@/pages/Privacy";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import Support from "@/pages/Support";
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
import TeamView from "@/pages/TeamView";
import TeamEventDetails from "@/pages/TeamEventDetails";
import Onboarding from "@/pages/Onboarding";
import OnboardingQuestionnaire from "@/pages/OnboardingQuestionnaire";
import rosterLogo from "@assets/Home_Logo_1768857215157.png";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black" data-testid="loading-app">
      <div className="relative w-32 h-32 flex items-center justify-center">
        <img 
          src={rosterLogo} 
          alt="Roster Logo" 
          className="w-20 h-20 object-contain z-10"
        />
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '2s' }}>
          <svg className="w-full h-full" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="70 200"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [location] = useLocation();
  const { isLoading: dataLoading } = useAppDataPrefetch(isAuthenticated && !authLoading);
  const { data: userData, isError: userDataError } = useQuery<any>({
    queryKey: ['/api/user'],
    enabled: isAuthenticated && !authLoading,
    staleTime: Infinity,
    retry: 3,
  });
  
  // Minimum 3-second display time for the loading screen
  const [minDelayElapsed, setMinDelayElapsed] = useState(false);
  // Maximum 10-second timeout to prevent infinite loading
  const [maxTimeoutReached, setMaxTimeoutReached] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const maxTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timersStartedRef = useRef(false);
  
  useEffect(() => {
    // Start timers only ONCE when authenticated and auth loading is complete
    if (isAuthenticated && !authLoading && !timersStartedRef.current) {
      timersStartedRef.current = true;
      
      timerRef.current = setTimeout(() => {
        setMinDelayElapsed(true);
      }, 3000);
      
      // Safety timeout - don't let loading screen stay forever
      maxTimerRef.current = setTimeout(() => {
        setMaxTimeoutReached(true);
      }, 10000);
    }
    
    // Cleanup only on unmount
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (maxTimerRef.current) {
        clearTimeout(maxTimerRef.current);
      }
    };
  }, [isAuthenticated, authLoading]);

  // Always render password reset pages standalone, regardless of auth state
  if (location === '/reset-password') {
    return <ResetPassword />;
  }

  if (location === '/forgot-password') {
    return <ForgotPassword />;
  }

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <ScrollToTop />
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/about" component={About} />
          <Route path="/hockey">{() => <SportLanding sport="hockey" />}</Route>
          <Route path="/soccer">{() => <SportLanding sport="soccer" />}</Route>
          <Route path="/baseball">{() => <SportLanding sport="baseball" />}</Route>
          <Route path="/for-youth-teams">{() => <SegmentLanding segment="for-youth-teams" />}</Route>
          <Route path="/for-adult-leagues">{() => <SegmentLanding segment="for-adult-leagues" />}</Route>
          <Route path="/for-varsity">{() => <SegmentLanding segment="for-varsity" />}</Route>
          <Route path="/waitlist" component={Waitlist} />
          <Route path="/login" component={Login} />
          <Route path="/get-started" component={OnboardingQuestionnaire} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route path="/support" component={Support} />
          <Route path="/facilities" component={FacilityBrowse} />
          <Route path="/facilities/:id" component={FacilityDetail} />
          <Route component={Landing} />
        </Switch>
      </>
    );
  }

  // Wait for BOTH: minimum 3 seconds AND data to be loaded before showing the app
  // OR if max timeout is reached, proceed anyway to prevent infinite loading
  if ((!minDelayElapsed || dataLoading) && !maxTimeoutReached) {
    return <LoadingScreen />;
  }

  // If the user data query failed entirely and we have no cached data, keep showing
  // the loading screen rather than pushing completed users into onboarding during
  // a transient backend outage. The query will auto-retry (retry: 3 above).
  if (userDataError && !userData) {
    return <LoadingScreen />;
  }

  // Default to showing onboarding when userData is absent or onboarding incomplete.
  // This ensures new users are never silently routed to the Dashboard.
  if (!userData || !userData.onboardingCompleted) {
    return <Onboarding />;
  }

  // Render get-started questionnaire without the app shell (no nav bar, no slide menus)
  if (location === '/get-started') {
    return <OnboardingQuestionnaire />;
  }

  return (
    <PermissionProvider>
      <SlideUpOverlayProvider>
      <ScrollToTop />
      <NativelyNotificationsInitializer />
      <div className="min-h-screen w-full bg-background">
        <div className="relative mx-auto w-full max-w-[1000px] min-h-screen">
        <SlideOutMenu />
        <SwipeableMainScreens>
          <PageTransition>
              <Switch>
              <Route path="/league-tournament-search" component={LeagueTournamentSearch} />
              <Route path="/league-search" component={LeagueSearch} />
              <Route path="/team-search" component={TeamSearch} />
              <Route path="/messages/:conversationId" component={Messages} />
              <Route path="/user/:userId" component={UserProfile} />
              <Route path="/subscription" component={Subscription} />
              <Route path="/roster" component={Roster} />
              <Route path="/create-league" component={CreateLeague} />
              <Route path="/create-team" component={CreateTeam} />
              <Route path="/create-scrimmage" component={CreateScrimmage} />
              <Route path="/edit-scrimmage/:id" component={CreateScrimmage} />
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
              <Route path="/team-event/:id" component={TeamEventDetails} />
              <Route path="/team/:id" component={TeamView} />
              <Route path="/announcements" component={Announcements} />
              <Route path="/substitute-confirmations" component={SubstituteConfirmations} />
              <Route path="/stats" component={Stats} />
              <Route path="/stats-management" component={StatsManagement} />
              <Route path="/scorekeeper" component={ScorekeeperDashboard} />
              <Route path="/create-payment-request" component={CreatePaymentRequest} />
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
              <Route path="/pricing" component={Pricing} />
              <Route path="/about" component={About} />
              <Route path="/hockey">{() => <SportLanding sport="hockey" />}</Route>
              <Route path="/soccer">{() => <SportLanding sport="soccer" />}</Route>
              <Route path="/baseball">{() => <SportLanding sport="baseball" />}</Route>
              <Route path="/for-youth-teams">{() => <SegmentLanding segment="for-youth-teams" />}</Route>
              <Route path="/for-adult-leagues">{() => <SegmentLanding segment="for-adult-leagues" />}</Route>
              <Route path="/for-varsity">{() => <SegmentLanding segment="for-varsity" />}</Route>
              <Route path="/privacy" component={Privacy} />
              <Route path="/privacy-policy" component={PrivacyPolicy} />
              <Route path="/terms-of-service" component={TermsOfService} />
              <Route path="/support" component={Support} />
              <Route path="/admin/stripe" component={StripeAdmin} />
              <Route component={Dashboard} />
            </Switch>
          </PageTransition>
        </SwipeableMainScreens>
          <HPIBBanner placement="bottom-nav" />
          <BottomNavigation />
        </div>
        </div>
      </SlideUpOverlayProvider>
    </PermissionProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WebSocketProvider>
            <Toaster />
            <Router />
          </WebSocketProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
