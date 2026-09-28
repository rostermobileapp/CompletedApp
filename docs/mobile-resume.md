# Mobile return-to-screen behavior

The main Roster interface is the React client used by the Natively iOS and
Android bridge (see the native purchase and notification integrations). The
separate `mobile/` Expo entry point currently renders a basic push-notification
status screen, not the main navigation; do not move Roster route restoration
there without first confirming a change to the store build.

On a fresh native-container launch at `/` or `/app`, the signed-in user's last stable
screen is restored after account data loads. Explicit paths, query strings and
hashes (including notification and external links) are never overridden.
Routes are stored per account in local device storage and expire after seven
days. Forms and temporary flows are excluded. A live backgrounded app keeps
its in-memory navigation; restoration runs only during initial startup.

The repository does not contain the Natively iOS/Android shell configuration
or device process logs. We cannot determine from source alone whether a
specific reported restart was OS memory eviction, a native wrapper reload, or
a crash. Check the installed store build's Natively startup URL and its
background/resume/reload settings and obtain iOS/Android device logs before
changing native lifecycle settings. The client has no automatic resume reload;
explicit reload actions exist for error recovery and subscription flows.
The main navigation currently keeps all five primary tabs mounted for smooth
swipes and scroll-position continuity; changing that behavior to reduce
memory requires device profiling because it affects navigation state.