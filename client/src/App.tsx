import { Switch, Route, useLocation } from "wouter";
import { useState, useEffect, useRef, useLayoutEffect, useSyncExternalStore } from "react";
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
import { WebsiteRedirect } from "@/components/WebsiteRedirect";
import { marketingDestination } from "@shared/appWebPolicy";
import PartnerApplication from "@/pages/PartnerApplication";
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
import AdminOrganizerCardPayments from "@/pages/AdminOrganizerCardPayments";
import HPIBDownload from "@/pages/HPIBDownload";
import Demo from "@/pages/Demo";
import GerryHomePreview from "@/pages/GerryHomePreview";
import TrophyCase, { TrophyCasePreview } from "@/pages/TrophyCase";
import EarnedPatches from "@/pages/EarnedPatches";
import BadgeCatalogAdmin from "@/pages/BadgeCatalogAdmin";
import rosterLogo from "@assets/Home_Logo_1768857215157.png";
import { applyCanonicalUrl } from "@/lib/seoMetadata";
import { authenticatedEntryDestination, shouldShowAppLogin } from "@/lib/appRouteEntry";
import { apiRequest } from "@/lib/queryClient";
import { isDevParentClient, parentVerificationSession } from "@/lib/parentVerificationSession";
import HighSchoolYouthOnboarding from "@/pages/HighSchoolYouthOnboarding";
import HighSchoolYouthOnboardingPreview from "@/pages/HighSchoolYouthOnboardingPreview";
import Under18Onboarding from "@/pages/Under18Onboarding";
import { isAgeFirstSignupEnabled, signupAgeRestriction } from "@/lib/signupAgeRestriction";
import ParentVerification from "@/pages/ParentVerification";
import { ParentAccountHome } from "@/components/high-school-family/ParentAccountHome";
import { TeamSkinBoundary } from "@/components/high-school-skins/TeamSkinBoundary";
import { familyAgeEligibility } from "@shared/familyEligibility";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black" data-testid="loading-app">
      <div className="relative w-32 h-32 flex items-center justify-center">
        <img 
          src={rosterLogo} 
          alt="RosterHockey logo"
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

export function Router() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { isActive: isDemoActive } = useDemo();
  const [location, setLocation] = useLocation();
  const ageRestricted=useSyncExternalStore(signupAgeRestriction.subscribe,signupAgeRestriction.snapshot,()=>false);
  const isPreviewHome=isDevParentClient&&location==="/"&&!isAuthenticated&&!ageRestricted;
  const isOnboardingPreview=isPreviewHome||(isDevParentClient&&location==="/high-school/onboarding-preview");
  const isStandaloneChildEntry=isAgeFirstSignupEnabled&&["/under-18","/under-18/code"].includes(location);
  // A returning, authenticated adult is never locked out by a pre-signup answer.
  const ageAllowsOnboarding=!isAgeFirstSignupEnabled||!ageRestricted||(import.meta.env.PROD&&isAuthenticated);
  useEffect(() => applyCanonicalUrl(location, isAuthenticated && location === '/'), [location, isAuthenticated]);

  const isDesktopWeb = useIsDesktopWeb();
  const parentRevision = useSyncExternalStore(parentVerificationSession.subscribe, parentVerificationSession.snapshot, parentVerificationSession.snapshot);
  const parentStatus = useQuery<{ enrolled: boolean; verified: boolean }>({
    queryKey: ["dev-parent-verification-status", user?.id, parentRevision],
    queryFn: async () => (await apiRequest("GET", "/api/high-school/parent-verification/status")).json(),
    enabled: isDevParentClient && isAuthenticated && !authLoading && !isOnboardingPreview && !isStandaloneChildEntry && ageAllowsOnboarding,
    staleTime: 0, retry: false, refetchInterval: 30_000,
  });
  const onboardingState=useQuery<{active:boolean}>({
    queryKey:["dev-hs-onboarding",user?.id,parentRevision],
    queryFn:async()=>(await apiRequest("GET","/api/high-school/onboarding/state")).json(),
    enabled:isDevParentClient&&isAuthenticated&&!authLoading&&!isOnboardingPreview&&!isStandaloneChildEntry&&ageAllowsOnboarding,
    staleTime:0,retry:false,
  });
  const onboardingAllowsLegacy=!isDevParentClient||onboardingState.data?.active===false;
  const refreshOnboarding=()=>{
    void queryClient.invalidateQueries({queryKey:["dev-hs-onboarding"]});
    void queryClient.invalidateQueries({queryKey:["dev-parent-verification-status"]});
  };
  const { data: userData, isError: userDataError } = useQuery<any>({
    queryKey: ['/api/user'],
    enabled: isAuthenticated && !authLoading && onboardingAllowsLegacy && ageAllowsOnboarding && !isOnboardingPreview && !isStandaloneChildEntry && (!isDevParentClient || parentStatus.data?.enrolled === false || parentStatus.data?.verified === true)
      && !(isDevParentClient && ["/high-school/parent-verification","/high-school/onboarding"].includes(location)),
    staleTime: Infinity,
    retry: 3,
  });
  // Load the account first; background requests must not compete with it.
  useAppDataPrefetch(isAuthenticated && !authLoading && !!userData && onboardingAllowsLegacy && ageAllowsOnboarding && !isOnboardingPreview && !isStandaloneChildEntry &&
    (!isDevParentClient || parentStatus.data?.enrolled === false || parentStatus.data?.verified === true));
  
  // This is only a safety timeout for slow data, not a mandatory splash delay.
  const [maxTimeoutReached, setMaxTimeoutReached] = useState(false);
  const [resumeReady, setResumeReady] = useState(false);
  const launchIsRoot = useRef(shouldRestoreOnLaunch(
    isInsideNativeWrapper(), window.location.pathname, window.location.search, window.location.hash,
  ));
  const lastUserId = useRef<string | null>(null);
  const restoringPath = useRef<string | null>(null);

  useEffect(() => {
    setMaxTimeoutReached(false);
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

    let savedPath: string | null = null;
    if (!resumeReady) {
      // A link that arrived while auth was loading supersedes the saved screen.
      savedPath = resolveLaunchScreen(
        localStorage, user.id, launchIsRoot.current, location,
        window.location.search, window.location.hash, isDemoActive,
      );
      setResumeReady(true);
    }
    const entryDestination = authenticatedEntryDestination(
      location, window.location.search, window.location.hash, savedPath,
    );
    if (entryDestination) {
      // Resolve restoration and launch aliases in ONE effect. Separate redirect
      // components can race and overwrite a notification or saved destination.
      restoringPath.current = entryDestination;
      setLocation(entryDestination, { replace: true });
      return;
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
  if(isOnboardingPreview)return <HighSchoolYouthOnboardingPreview startAtSignup={isPreviewHome}/>;
  if(isStandaloneChildEntry)return <Under18Onboarding/>;
  if(!ageAllowsOnboarding&&!["/login","/forgot-password","/reset-password"].includes(location))return <Under18Onboarding/>;
  if(isDevParentClient&&location==="/high-school/onboarding"){
    if(authLoading||(isAuthenticated&&parentStatus.isLoading))return <LoadingScreen/>;
    if(isAuthenticated&&(parentStatus.isError||(parentStatus.data?.enrolled&&!parentStatus.data.verified))){
      return <ParentVerification enrolled={parentStatus.data?.enrolled} unavailable={parentStatus.isError}/>;
    }
    return <HighSchoolYouthOnboarding key={`${user?.id}:${parentRevision}`} authenticated={isAuthenticated}
      onChange={refreshOnboarding} onAdult={() => { refreshOnboarding(); setLocation("/"); }}/>;
  }
  if (isDevParentClient && location === "/high-school/parent-verification") {
    if (authLoading || (isAuthenticated && parentStatus.isLoading)) return <LoadingScreen />;
    return <ParentVerification authenticated={isAuthenticated} enrolled={parentStatus.data?.enrolled} verified={parentStatus.data?.verified} unavailable={parentStatus.isError} />;
  }
  if (location === '/reset-password') {
    return <ResetPassword />;
  }

  if (location === '/forgot-password') {
    return <ForgotPassword />;
  }

  if (location === '/referral-program/apply') {
    return <PartnerApplication />;
  }

  if (location === '/hpib') {
    return <HPIBDownload />;
  }

  if (import.meta.env.DEV && location === '/trophy-case-preview') {
    return <PermissionProvider><TrophyCasePreview /></PermissionProvider>;
  }

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (marketingDestination(location)) {
    return <WebsiteRedirect path={location} search={window.location.search} />;
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
    // Keep the notification URL in place while signing in. An expired session
    // is not a missing page, and login must not discard the requested resource.
    if (shouldShowAppLogin(location, isInsideNativeWrapper(), window.location.search)) {
      return <Login />;
    }
    return (
      <>
        <ScrollToTop />
        <Switch>
          <Route path="/" component={Login} />
          <Route path="/app" component={Login} />
          <Route path="/login" component={Login} />
          <Route path="/get-started" component={OnboardingQuestionnaire} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/privacy">{() => <Privacy publicPage />}</Route>
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route path="/terms" component={TermsOfService} />
          <Route path="/facilities" component={FacilityBrowse} />
          <Route path="/facilities/:id" component={FacilityDetail} />
          <Route path="/referral-program/portal/auth" component={ReferralPortalAuth} />
          <Route path="/referral-program/portal/set-password" component={ReferralPortalSetPassword} />
          <Route path="/referral-program/portal/forgot-password" component={ReferralPortalForgotPassword} />
          <Route path="/referral-program/portal/login" component={ReferralPortalLogin} />
          <Route path="/referral-program/portal" component={ReferralPortal} />
          <Route path="/referral-program/verify" component={ReferralApplicationVerification} />
          <Route path="/admin/referrals/login" component={ReferralAdminLogin} />
          <Route path="/admin/referrals/partner/:id" component={ReferralAdminPartnerDetail} />
          <Route path="/admin/referrals" component={ReferralAdmin} />
          <Route component={NotFound} />
        </Switch>
      </>
    );
  }

  if (isDevParentClient) {
    if (parentStatus.isLoading) return <LoadingScreen />;
    if ((location === "/" || location === "/app") && (parentStatus.isError || (parentStatus.data?.enrolled && !parentStatus.data.verified))) {
      return <ParentAccountHome />;
    }
    if (parentStatus.isError || (parentStatus.data?.enrolled && !parentStatus.data.verified)) {
      return <ParentVerification enrolled={parentStatus.data?.enrolled} unavailable={parentStatus.isError} />;
    }
    if(onboardingState.isLoading)return <LoadingScreen/>;
    if(onboardingState.isError||onboardingState.data?.active){
      return <HighSchoolYouthOnboarding key={`${user?.id}:${parentRevision}`} onChange={refreshOnboarding}
        onAdult={() => { refreshOnboarding(); setLocation("/"); }}/>;
    }
  }

  if (!userData && !userDataError) {
    if (!maxTimeoutReached) return <LoadingScreen />;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center" role="status">
        <p>Your account is taking longer than usual to load. We’re still trying.</p>
        <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.location.reload()}>Retry loading</button>
      </div>
    );
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
    return <Onboarding familyAccountId={import.meta.env.PROD && familyAgeEligibility(userData.dateOfBirth).eligible
      ? user?.id : undefined} />;
  }

  if (isInsideNativeWrapper() && !resumeReady) return <LoadingScreen />;
  // The layout effect resolves these before paint; never mount the 404 fallback
  // for the launch address or the just-completed login during that transition.
  if (location === '/app' || location === '/login') return <LoadingScreen />;

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
              <Route path="/messages" component={Messages} />
              <Route path="/messages/:conversationId" component={Messages} />
              <Route path="/user/:userId" component={UserProfile} />
              <Route path="/trophy-case/earned-patches" component={EarnedPatches} />
              <Route path="/trophy-case" component={TrophyCase} />
              <Route path="/admin/badges" component={BadgeCatalogAdmin} />
              <Route path="/subscription" component={Subscription} />
               {/* Keep routes used by notifications created before URL normalization. */}
               <Route path="/settings/billing" component={Subscription} />
               <Route path="/subscriptions" component={Subscription} />
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
               <Route path="/league-management/:leagueId" component={LeagueManagement} />
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
              <Route path="/admin/referrals/login" component={ReferralAdminLogin} />
              <Route path="/admin/referrals/partner/:id" component={ReferralAdminPartnerDetail} />
              <Route path="/admin/referrals" component={ReferralAdmin} />
              <Route path="/privacy">{() => <Privacy />}</Route>
              <Route path="/privacy-policy" component={PrivacyPolicy} />
              <Route path="/terms-of-service" component={TermsOfService} />
              <Route path="/terms" component={TermsOfService} />
              <Route path="/admin/stripe" component={StripeAdmin} />
              <Route path="/admin/metrics" component={AdminMetrics} />
              <Route path="/admin/organizer-card-payments" component={AdminOrganizerCardPayments} />
              <Route component={NotFound} />
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
              {/* Honor the user's OS-level "reduce motion" preference for any
                  framer-motion animation in the app (e.g. the bottom-nav
                  active-tab morph). */}
              <MotionConfig reducedMotion="user">
                <Toaster />
                <ErrorBoundary>
                  <DemoContextProvider>
                    <TeamSkinBoundary entry={<Router />}>
                      <WebSocketProvider>
                        <NativeCalendarAutoSync />
                        <BadgeEarnedHost />
                        <BirthdayHost />
                        <TriviaHost />
                        <Router />
                      </WebSocketProvider>
                    </TeamSkinBoundary>
                  </DemoContextProvider>
                </ErrorBoundary>
              </MotionConfig>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
