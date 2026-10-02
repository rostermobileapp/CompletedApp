import { Switch, Route, useLocation } from "wouter";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { MotionConfig } from "framer-motion";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PermissionProvider } from "@/context/SubscriptionContext";
import { DemoContextProvider } from "@/context/DemoContext";
import { useDemo } from "@/context/DemoContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { BottomNavigation } from "@/components/BottomNavigation";
import { HPIBBanner } from "@/components/HPIBBanner";
import { ActiveDraftsBanner } from "@/components/ActiveDraftsBanner";
import { PageTransition } from "@/components/PageTransition";
import { SlideOutMenu } from "@/components/SlideOutMenu";
import { SwipeableMainScreens } from "@/components/SwipeableMainScreens";
import { DesktopAppShell } from "@/components/DesktopAppShell";
import { ScrollToTop } from "@/components/ScrollToTop";
import { SlideUpOverlayProvider } from "@/components/SlideUpOverlay";
import { useAuth } from "@/hooks/useAuth";
import { useAppDataPrefetch } from "@/hooks/useAppDataPrefetch";
import { useIsDesktopWeb, isInsideNativeWrapper } from "@/hooks/useIsDesktopWeb";
import { forgetMobileScreen, resolveLaunchScreen, rememberMobileScreen, shouldRestoreOnLaunch } from "@/lib/mobileScreenResume";
import { NativelyNotificationsInitializer } from "@/components/NativelyNotificationsInitializer";
import { NativeCalendarAutoSync } from "@/components/NativeCalendarAutoSync";
import { BadgeEarnedHost } from "@/components/BadgeEarnedHost";
import { BirthdayHost } from "@/components/BirthdayHost";
import { TriviaHost } from "@/components/TriviaHost";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Pricing from "@/pages/Pricing";
import About from "@/pages/About";
import SportLanding from "@/pages/SportLanding";
import SegmentLanding from "@/pages/SegmentLanding";
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
import DraftRoom from "@/pages/DraftRoom";
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
import PlayerStatsTrends from "@/pages/PlayerStatsTrends";
import TeamEventDetails from "@/pages/TeamEventDetails";
import Onboarding from "@/pages/Onboarding";
import OnboardingQuestionnaire from "@/pages/OnboardingQuestionnaire";
import FeaturesLanding from "@/pages/FeaturesLanding";
import ReferralProgram from "@/pages/ReferralProgram";
import ReferralApplicationVerification from "@/pages/ReferralApplicationVerification";
import ReferralPortalLogin from "@/pages/ReferralPortalLogin";
import ReferralPortalAuth from "@/pages/ReferralPortalAuth";
import ReferralPortalSetPassword from "@/pages/ReferralPortalSetPassword";
import ReferralPortalForgotPassword from "@/pages/ReferralPortalForgotPassword";
import ReferralPortal from "@/pages/ReferralPortal";
import ReferralAdmin from "@/pages/ReferralAdmin";
import ReferralAdminLogin from "@/pages/ReferralAdminLogin";
import ReferralAdminPartnerDetail from "@/pages/ReferralAdminPartnerDetail";
import AdminMetrics from "@/pages/AdminMetrics";
import HPIBDownload from "@/pages/HPIBDownload";
import Demo from "@/pages/Demo";
import GerryHomePreview from "@/pages/GerryHomePreview";
import TrophyCase, { TrophyCasePreview } from "@/pages/TrophyCase";
import EarnedPatches from "@/pages/EarnedPatches";
import BadgeCatalogAdmin from "@/pages/BadgeCatalogAdmin";
import rosterLogo from "@assets/Home_Logo_1768857215157.png";

function RedirectToLogin() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/login'); }, [setLocation]);
  return null;
}

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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { isActive: isDemoActive } = useDemo();
  const [location, setLocation] = useLocation();

  const isDesktopWeb = useIsDesktopWeb();
  useAppDataPrefetch(isAuthenticated && !authLoading);
  const { data: userData, isError: userDataError } = useQuery<any>({
    queryKey: ['/api/user'],
    enabled: isAuthenticated && !authLoading,
    staleTime: Infinity,
    retry: 3,
  });
  
  // This is only a safety timeout for slow data, not a mandatory splash delay.
  const [maxTimeoutReached, setMaxTimeoutReached] = useState(false);
  const [resumeReady, setResumeReady] = useState(false);
  const launchIsRoot = useRef(shouldRestoreOnLaunch(
    isInsideNativeWrapper(), window.location.pathname, window.location.search, window.location.hash,
  ));
  const lastUserId = useRef<string | null>(null);
  const restoringPath = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated || userData) return;
    const timer = window.setTimeout(() => setMaxTimeoutReached(true), 10000);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, authLoading, userData]);

  useLayoutEffect(() => {
    if (authLoading) return;
    if (!user) {
      forgetMobileScreen(localStorage);
      if (lastUserId.current) queryClient.clear();
      lastUserId.current = null;
      restoringPath.current = null;
      setResumeReady(true);
      return;
    }
    if (lastUserId.current && lastUserId.current !== user.id) {
      forgetMobileScreen(localStorage);
      // The shared query cache is not keyed by account. Never show data left
      // behind by the previous session while the new account is loading.
      queryClient.clear();
      lastUserId.current = user.id;
      restoringPath.current = null;
      setResumeReady(true);
      return;
    }
    lastUserId.current = user.id;
    if (!userData?.onboardingCompleted) return;

    if (!resumeReady) {
      // A link that arrived while auth was loading supersedes the saved screen.
      const savedPath = resolveLaunchScreen(
        localStorage, user.id, launchIsRoot.current, location,
        window.location.search, window.location.hash, isDemoActive,
      );
      if (savedPath) {
        restoringPath.current = savedPath;
        setLocation(savedPath, { replace: true });
        setResumeReady(true);
        return;
      }
      setResumeReady(true);
    }
    // Wouter can notify its listeners on the next render; do not overwrite
    // the saved destination with the launch root in that narrow interval.
    if (restoringPath.current && (location === '/' || location === '/app')) return;
    restoringPath.current = null;
    if (resumeReady && !isDemoActive && isInsideNativeWrapper()) {
      rememberMobileScreen(localStorage, user.id, location);
    }
  }, [authLoading, user, userData, isDemoActive, location, resumeReady, setLocation]);

  // Always render standalone pages regardless of auth state
  if (location === '/reset-password') {
    return <ResetPassword />;
  }

  if (location === '/forgot-password') {
    return <ForgotPassword />;
  }

  if (location === '/hpib') {
    return <HPIBDownload />;
  }

  if (import.meta.env.DEV && location === '/trophy-case-preview') {
    return <TrophyCasePreview />;
  }

  if (authLoading) {
    return <LoadingScreen />;
  }

  // Development-only entry point for visually reviewing each profile onboarding step.
  // This intentionally works without a session because the preview is visual-only.
  if (import.meta.env.DEV && location === '/onboarding-preview') {
    return <Onboarding />;
  }

  // Development-only visual preview for the confirmed Gerry Zadnik home state.
  // This never performs API calls or changes live account data.
  if (import.meta.env.DEV && location === '/gerry-home-preview') {
    return <GerryHomePreview />;
  }

  if (!isAuthenticated) {
    return (
      <>
        <ScrollToTop />
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/features" component={FeaturesLanding} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/about" component={About} />
          <Route path="/hockey">{() => <SportLanding sport="hockey" />}</Route>
          <Route path="/soccer">{() => <SportLanding sport="soccer" />}</Route>
          <Route path="/baseball">{() => <SportLanding sport="baseball" />}</Route>
          <Route path="/for-youth-teams">{() => <SegmentLanding segment="for-youth-teams" />}</Route>
          <Route path="/for-adult-leagues">{() => <SegmentLanding segment="for-adult-leagues" />}</Route>
          <Route path="/for-varsity">{() => <SegmentLanding segment="for-varsity" />}</Route>
          <Route path="/app" component={RedirectToLogin} />
          <Route path="/login" component={Login} />
          <Route path="/get-started" component={OnboardingQuestionnaire} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route path="/support" component={Support} />
          <Route path="/facilities" component={FacilityBrowse} />
          <Route path="/facilities/:id" component={FacilityDetail} />
          <Route path="/referral-program/portal/auth" component={ReferralPortalAuth} />
          <Route path="/referral-program/portal/set-password" component={ReferralPortalSetPassword} />
          <Route path="/referral-program/portal/forgot-password" component={ReferralPortalForgotPassword} />
          <Route path="/referral-program/portal/login" component={ReferralPortalLogin} />
          <Route path="/referral-program/portal" component={ReferralPortal} />
          <Route path="/referral-program/verify" component={ReferralApplicationVerification} />
          <Route path="/referral-program" component={ReferralProgram} />
          <Route path="/admin/referrals/login" component={ReferralAdminLogin} />
          <Route path="/admin/referrals/partner/:id" component={ReferralAdminPartnerDetail} />
          <Route path="/admin/referrals" component={ReferralAdmin} />
          <Route component={Landing} />
        </Switch>
      </>
    );
  }

  if (!userData && !userDataError && !maxTimeoutReached) {
    return <LoadingScreen />;
  }

  // Never send a returning user to onboarding when the account API fails.
  if (!userData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p>We couldn't load your account. Please check your connection and try again.</p>
        <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  if (!userData.onboardingCompleted) {
    return <Onboarding />;
  }

  if (isInsideNativeWrapper() && !resumeReady) return <LoadingScreen />;

  // Render get-started questionnaire without the app shell (no nav bar, no slide menus)
  if (location === '/get-started') {
    return <OnboardingQuestionnaire />;
  }

  const routesSwitch = (
    <Switch>
      <Route path="/demo" component={Demo} />
      <Route path="/league-tournament-search" component={LeagueTournamentSearch} />
              <Route path="/league-search" component={LeagueSearch} />
              <Route path="/team-search" component={TeamSearch} />
              <Route path="/messages/:conversationId" component={Messages} />
              <Route path="/user/:userId" component={UserProfile} />
              <Route path="/trophy-case/earned-patches" component={EarnedPatches} />
              <Route path="/trophy-case" component={TrophyCase} />
              <Route path="/admin/badges" component={BadgeCatalogAdmin} />
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
              <Route path="/draft/:draftId" component={DraftRoom} />
              <Route path="/league/:leagueId/score-verification" component={ScoreVerification} />
              <Route path="/league-list" component={LeagueList} />
              <Route path="/calendar" component={Calendar} />
              <Route path="/game/:id" component={GameDetails} />
              <Route path="/scrimmage/:id" component={GameDetails} />
              <Route path="/team-event/:id" component={TeamEventDetails} />
              <Route path="/team/:id" component={TeamView} />
              <Route path="/player-stats/:userId" component={PlayerStatsTrends} />
              <Route path="/announcements" component={Announcements} />
              <Route path="/substitute-confirmations" component={SubstituteConfirmations} />
              <Route path="/stats" component={Stats} />
              <Route path="/stats-management" component={StatsManagement} />
              <Route path="/scorekeeper" component={ScorekeeperDashboard} />
              <Route path="/create-payment-request">
                {() => <CreatePaymentRequest />}
              </Route>
              <Route path="/payment-requests/:id/edit">
                {(params) => <CreatePaymentRequest editingRequestId={params.id} />}
              </Route>
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
              <Route path="/referral-program/portal/auth" component={ReferralPortalAuth} />
              <Route path="/referral-program/portal/set-password" component={ReferralPortalSetPassword} />
              <Route path="/referral-program/portal/forgot-password" component={ReferralPortalForgotPassword} />
              <Route path="/referral-program/portal/login" component={ReferralPortalLogin} />
              <Route path="/referral-program/portal" component={ReferralPortal} />
              <Route path="/referral-program/verify" component={ReferralApplicationVerification} />
              <Route path="/referral-program" component={ReferralProgram} />
              <Route path="/admin/referrals/login" component={ReferralAdminLogin} />
              <Route path="/admin/referrals/partner/:id" component={ReferralAdminPartnerDetail} />
              <Route path="/admin/referrals" component={ReferralAdmin} />
              <Route path="/privacy" component={Privacy} />
              <Route path="/privacy-policy" component={PrivacyPolicy} />
              <Route path="/terms-of-service" component={TermsOfService} />
              <Route path="/support" component={Support} />
              <Route path="/about" component={About} />
              <Route path="/admin/stripe" component={StripeAdmin} />
              <Route path="/admin/metrics" component={AdminMetrics} />
              <Route component={Dashboard} />
            </Switch>
  );

  return (
    <PermissionProvider>
      <SlideUpOverlayProvider>
        <ScrollToTop />
        <NativelyNotificationsInitializer />
        {isDesktopWeb ? (
          <DesktopAppShell>
            <ActiveDraftsBanner />
            <PageTransition>{routesSwitch}</PageTransition>
          </DesktopAppShell>
        ) : (
          <div className="min-h-screen w-full bg-background">
            <div className="relative mx-auto w-full max-w-[1000px] min-h-screen">
              <SlideOutMenu />
              <ActiveDraftsBanner />
              <SwipeableMainScreens>
                <PageTransition>{routesSwitch}</PageTransition>
              </SwipeableMainScreens>
              <HPIBBanner placement="bottom-nav" />
              <BottomNavigation />
            </div>
          </div>
        )}
      </SlideUpOverlayProvider>
    </PermissionProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <WebSocketProvider>
              {/* Honor the user's OS-level "reduce motion" preference for any
                  framer-motion animation in the app (e.g. the bottom-nav
                  active-tab morph). */}
              <MotionConfig reducedMotion="user">
                <Toaster />
                <NativeCalendarAutoSync />
                <BadgeEarnedHost />
                <ErrorBoundary>
                  <DemoContextProvider>
                    <BirthdayHost />
                    <TriviaHost />
                    <Router />
                  </DemoContextProvider>
                </ErrorBoundary>
              </MotionConfig>
            </WebSocketProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
