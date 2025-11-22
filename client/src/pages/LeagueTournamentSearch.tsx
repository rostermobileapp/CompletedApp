import { useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function LeagueTournamentSearch() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("leagues");

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="league-tournament-search-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Find Leagues & Tournaments</h1>
          <button 
            onClick={() => navigate('/')}
            className="text-primary text-sm"
            data-testid="button-skip"
          >
            Skip
          </button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="leagues" data-testid="tab-leagues">Leagues</TabsTrigger>
            <TabsTrigger value="tournaments" data-testid="tab-tournaments">Tournaments</TabsTrigger>
          </TabsList>
          
          <TabsContent value="leagues" className="mt-0">
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Search for hockey leagues to join and play with your team
              </p>
              <Button 
                onClick={() => navigate('/league-search')}
                className="w-full"
                size="lg"
                data-testid="button-go-to-league-search"
              >
                Search for Leagues
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="tournaments" className="mt-0">
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Enter a tournament ID to find and join tournaments
              </p>
              <Button 
                onClick={() => navigate('/tournament-search')}
                className="w-full"
                size="lg"
                data-testid="button-go-to-tournament-search"
              >
                Search for Tournaments
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
