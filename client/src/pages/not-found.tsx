import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { reportRouteMiss } from "@/lib/routeMissReporting";
import { isInsideNativeWrapper } from "@/hooks/useIsDesktopWeb";

export default function NotFound() {
  const [location, navigate] = useLocation();
  useEffect(() => {
    // Ignore fallback mounts that disappear during auth/route transitions.
    const timer = window.setTimeout(() => reportRouteMiss(location, isInsideNativeWrapper()), 300);
    return () => window.clearTimeout(timer);
  }, [location]);
  return (
    <div className="min-h-[80dvh] w-full flex items-center justify-center bg-background px-4 pb-24" data-testid="route-not-found">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 shrink-0 text-destructive" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground">Page unavailable</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            This link may be out of date or the page may have moved. You can return Home or go back and try again.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => navigate('/', { replace: true })}>Go Home</Button>
            <Button variant="outline" onClick={() => {
              // A fresh native web view may have no app page to go back to.
              if (window.history.length > 1 && new URL(document.referrer || window.location.origin).origin === window.location.origin) {
                window.history.back();
              } else navigate('/', { replace: true });
            }}>Go back</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
