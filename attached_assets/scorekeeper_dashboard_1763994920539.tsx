import React, { useState, useEffect } from 'react';
import { Trash2, Check, Plus, Trophy } from 'lucide-react';

const ScorekeeperDashboard = () => {
  const [selectedGame, setSelectedGame] = useState(null);
  const [awayScore, setAwayScore] = useState(0);
  const [homeScore, setHomeScore] = useState(0);
  const [awayGoals, setAwayGoals] = useState([]);
  const [homeGoals, setHomeGoals] = useState([]);
  const [awayPenalties, setAwayPenalties] = useState([]);
  const [homePenalties, setHomePenalties] = useState([]);
  const [playerStats, setPlayerStats] = useState({});
  const [completedGames, setCompletedGames] = useState({});
  const [teamStandings, setTeamStandings] = useState({});

  // Sample schedule of games
  const schedule = [
    {
      id: 1,
      date: '2024-11-24',
      time: '7:00 PM',
      awayTeam: 'Eagles',
      homeTeam: 'Hawks',
      awayPlayers: ['John Smith', 'Mike Johnson', 'Chris Brown', 'Tom Wilson', 'Dave Clark'],
      homePlayers: ['Sam Davis', 'Rob Miller', 'Jake Anderson', 'Luke Thomas', 'Ryan Moore']
    },
    {
      id: 2,
      date: '2024-11-24',
      time: '8:30 PM',
      awayTeam: 'Lions',
      homeTeam: 'Tigers',
      awayPlayers: ['Paul White', 'Mark Harris', 'Steve Martin', 'Dan Taylor', 'Jim Garcia'],
      homePlayers: ['Alex Martinez', 'Brian Rodriguez', 'Eric Lee', 'Nick Walker', 'Matt Hall']
    },
    {
      id: 3,
      date: '2024-11-25',
      time: '6:00 PM',
      awayTeam: 'Wolves',
      homeTeam: 'Bears',
      awayPlayers: ['Kevin Young', 'Josh Allen', 'Tyler King', 'Adam Wright', 'Ben Scott'],
      homePlayers: ['Carl Green', 'Greg Adams', 'Sean Baker', 'Drew Nelson', 'Kyle Carter']
    }
  ];

  // Load saved data on mount
  useEffect(() => {
    loadSavedData();
  }, []);

  const loadSavedData = async () => {
    try {
      // Load completed games
      const gamesResult = await window.storage.get('completed-games');
      if (gamesResult) {
        setCompletedGames(JSON.parse(gamesResult.value));
      }

      // Load team standings
      const standingsResult = await window.storage.get('team-standings');
      if (standingsResult) {
        setTeamStandings(JSON.parse(standingsResult.value));
      }

      // Load player stats
      const statsResult = await window.storage.get('player-stats');
      if (statsResult) {
        setPlayerStats(JSON.parse(statsResult.value));
      }
    } catch (error) {
      console.log('No saved data found, starting fresh');
    }
  };

  const selectGame = (game) => {
    // Check if game is already completed
    if (completedGames[game.id]) {
      const loadCompleted = window.confirm('This game has already been completed. Do you want to view/edit it?');
      if (!loadCompleted) return;
      
      const savedGame = completedGames[game.id];
      setSelectedGame(game);
      setAwayScore(savedGame.awayScore);
      setHomeScore(savedGame.homeScore);
      setAwayGoals(savedGame.awayGoals);
      setHomeGoals(savedGame.homeGoals);
      setAwayPenalties(savedGame.awayPenalties);
      setHomePenalties(savedGame.homePenalties);
    } else {
      setSelectedGame(game);
      setAwayScore(0);
      setHomeScore(0);
      setAwayGoals([]);
      setHomeGoals([]);
      setAwayPenalties([]);
      setHomePenalties([]);
    }
  };

  const awayPlayers = selectedGame?.awayPlayers || [];
  const homePlayers = selectedGame?.homePlayers || [];

  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const addGoal = (team) => {
    const newGoal = {
      id: Date.now(),
      scorer: '',
      primaryAssist: '',
      secondaryAssist: '',
      timestamp: getCurrentTime(),
      submitted: false
    };
    
    if (team === 'away') {
      setAwayGoals([...awayGoals, newGoal]);
    } else {
      setHomeGoals([...homeGoals, newGoal]);
    }
  };

  const updateGoal = (team, id, field, value) => {
    const updateGoals = (goals) => 
      goals.map(goal => goal.id === id ? { ...goal, [field]: value } : goal);
    
    if (team === 'away') {
      setAwayGoals(updateGoals(awayGoals));
    } else {
      setHomeGoals(updateGoals(homeGoals));
    }
  };

  const submitGoal = (team, id) => {
    const goals = team === 'away' ? awayGoals : homeGoals;
    const goal = goals.find(g => g.id === id);
    
    if (!goal.scorer) {
      alert('Please select a scorer before submitting');
      return;
    }

    // Update player stats
    const newStats = { ...playerStats };
    
    if (goal.scorer) {
      newStats[goal.scorer] = newStats[goal.scorer] || { goals: 0, assists: 0, penalties: 0 };
      newStats[goal.scorer].goals++;
    }
    if (goal.primaryAssist) {
      newStats[goal.primaryAssist] = newStats[goal.primaryAssist] || { goals: 0, assists: 0, penalties: 0 };
      newStats[goal.primaryAssist].assists++;
    }
    if (goal.secondaryAssist) {
      newStats[goal.secondaryAssist] = newStats[goal.secondaryAssist] || { goals: 0, assists: 0, penalties: 0 };
      newStats[goal.secondaryAssist].assists++;
    }
    
    setPlayerStats(newStats);

    // Update score and mark as submitted
    if (team === 'away') {
      setAwayScore(awayScore + 1);
      setAwayGoals(awayGoals.map(g => g.id === id ? { ...g, submitted: true } : g));
    } else {
      setHomeScore(homeScore + 1);
      setHomeGoals(homeGoals.map(g => g.id === id ? { ...g, submitted: true } : g));
    }
  };

  const deleteGoal = (team, id) => {
    const goals = team === 'away' ? awayGoals : homeGoals;
    const goal = goals.find(g => g.id === id);
    
    // If goal was submitted, remove from stats and update score
    if (goal.submitted) {
      const newStats = { ...playerStats };
      
      if (goal.scorer && newStats[goal.scorer]) {
        newStats[goal.scorer].goals--;
      }
      if (goal.primaryAssist && newStats[goal.primaryAssist]) {
        newStats[goal.primaryAssist].assists--;
      }
      if (goal.secondaryAssist && newStats[goal.secondaryAssist]) {
        newStats[goal.secondaryAssist].assists--;
      }
      
      setPlayerStats(newStats);
      
      if (team === 'away') {
        setAwayScore(Math.max(0, awayScore - 1));
      } else {
        setHomeScore(Math.max(0, homeScore - 1));
      }
    }
    
    if (team === 'away') {
      setAwayGoals(awayGoals.filter(g => g.id !== id));
    } else {
      setHomeGoals(homeGoals.filter(g => g.id !== id));
    }
  };

  const addPenalty = (team) => {
    const newPenalty = {
      id: Date.now(),
      player: '',
      timestamp: getCurrentTime(),
      submitted: false
    };
    
    if (team === 'away') {
      setAwayPenalties([...awayPenalties, newPenalty]);
    } else {
      setHomePenalties([...homePenalties, newPenalty]);
    }
  };

  const updatePenalty = (team, id, value) => {
    const updatePenalties = (penalties) =>
      penalties.map(p => p.id === id ? { ...p, player: value } : p);
    
    if (team === 'away') {
      setAwayPenalties(updatePenalties(awayPenalties));
    } else {
      setHomePenalties(updatePenalties(homePenalties));
    }
  };

  const submitPenalty = (team, id) => {
    const penalties = team === 'away' ? awayPenalties : homePenalties;
    const penalty = penalties.find(p => p.id === id);
    
    if (!penalty.player) {
      alert('Please select a player before submitting');
      return;
    }

    // Update player stats
    const newStats = { ...playerStats };
    newStats[penalty.player] = newStats[penalty.player] || { goals: 0, assists: 0, penalties: 0 };
    newStats[penalty.player].penalties++;
    setPlayerStats(newStats);

    // Mark as submitted
    if (team === 'away') {
      setAwayPenalties(awayPenalties.map(p => p.id === id ? { ...p, submitted: true } : p));
    } else {
      setHomePenalties(homePenalties.map(p => p.id === id ? { ...p, submitted: true } : p));
    }
  };

  const deletePenalty = (team, id) => {
    const penalties = team === 'away' ? awayPenalties : homePenalties;
    const penalty = penalties.find(p => p.id === id);
    
    // If penalty was submitted, remove from stats
    if (penalty.submitted && penalty.player) {
      const newStats = { ...playerStats };
      if (newStats[penalty.player]) {
        newStats[penalty.player].penalties--;
      }
      setPlayerStats(newStats);
    }
    
    if (team === 'away') {
      setAwayPenalties(awayPenalties.filter(p => p.id !== id));
    } else {
      setHomePenalties(homePenalties.filter(p => p.id !== id));
    }
  };

  const completeGame = async () => {
    if (!selectedGame) return;

    const confirmed = window.confirm(
      `Are you sure you want to mark this game as complete?\n\n${selectedGame.awayTeam}: ${awayScore}\n${selectedGame.homeTeam}: ${homeScore}\n\nThis will update team standings and save all stats.`
    );

    if (!confirmed) return;

    try {
      // Update team standings
      const newStandings = { ...teamStandings };
      
      // Initialize teams if they don't exist
      if (!newStandings[selectedGame.awayTeam]) {
        newStandings[selectedGame.awayTeam] = { wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
      }
      if (!newStandings[selectedGame.homeTeam]) {
        newStandings[selectedGame.homeTeam] = { wins: 0, losses: 0, ties: 0, goalsFor: 0, goalsAgainst: 0 };
      }

      // Update goals for/against
      newStandings[selectedGame.awayTeam].goalsFor += awayScore;
      newStandings[selectedGame.awayTeam].goalsAgainst += homeScore;
      newStandings[selectedGame.homeTeam].goalsFor += homeScore;
      newStandings[selectedGame.homeTeam].goalsAgainst += awayScore;

      // Determine winner
      if (awayScore > homeScore) {
        newStandings[selectedGame.awayTeam].wins++;
        newStandings[selectedGame.homeTeam].losses++;
      } else if (homeScore > awayScore) {
        newStandings[selectedGame.homeTeam].wins++;
        newStandings[selectedGame.awayTeam].losses++;
      } else {
        newStandings[selectedGame.awayTeam].ties++;
        newStandings[selectedGame.homeTeam].ties++;
      }

      // Save completed game data
      const newCompletedGames = {
        ...completedGames,
        [selectedGame.id]: {
          gameId: selectedGame.id,
          awayTeam: selectedGame.awayTeam,
          homeTeam: selectedGame.homeTeam,
          awayScore,
          homeScore,
          awayGoals,
          homeGoals,
          awayPenalties,
          homePenalties,
          completedAt: new Date().toISOString()
        }
      };

      // Save all data to storage
      await window.storage.set('completed-games', JSON.stringify(newCompletedGames));
      await window.storage.set('team-standings', JSON.stringify(newStandings));
      await window.storage.set('player-stats', JSON.stringify(playerStats));

      setCompletedGames(newCompletedGames);
      setTeamStandings(newStandings);

      alert('Game completed and saved successfully!');
      setSelectedGame(null);
    } catch (error) {
      console.error('Error saving game:', error);
      alert('Error saving game data. Please try again.');
    }
  };

  const TeamSide = ({ team, score, goals, penalties, players }) => (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">
          {team === 'away' ? selectedGame.awayTeam : selectedGame.homeTeam}
        </h2>
        <div className="text-6xl font-bold text-blue-600">{score}</div>
      </div>

      <button
        onClick={() => addGoal(team)}
        className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-lg mb-4 flex items-center justify-center gap-2"
      >
        <Plus size={20} />
        Add Goal
      </button>

      <div className="space-y-3 mb-6">
        {goals.map((goal, idx) => (
          <div key={goal.id} className={`bg-white rounded-lg shadow-md p-4 border-2 ${goal.submitted ? 'border-green-500' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start mb-3">
              <div className="font-semibold text-lg">Goal #{idx + 1}</div>
              <div className="flex gap-2">
                {!goal.submitted && (
                  <button
                    onClick={() => submitGoal(team, goal.id)}
                    className="text-green-600 hover:text-green-700"
                  >
                    <Check size={20} />
                  </button>
                )}
                <button
                  onClick={() => deleteGoal(team, goal.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium mb-1">Scorer *</label>
                <select
                  value={goal.scorer}
                  onChange={(e) => updateGoal(team, goal.id, 'scorer', e.target.value)}
                  disabled={goal.submitted}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select Player</option>
                  {players.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Primary Assist</label>
                <select
                  value={goal.primaryAssist}
                  onChange={(e) => updateGoal(team, goal.id, 'primaryAssist', e.target.value)}
                  disabled={goal.submitted}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select Player</option>
                  {players.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Secondary Assist</label>
                <select
                  value={goal.secondaryAssist}
                  onChange={(e) => updateGoal(team, goal.id, 'secondaryAssist', e.target.value)}
                  disabled={goal.submitted}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select Player</option>
                  {players.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              
              <div className="text-sm text-gray-600 mt-2">
                Time: {goal.timestamp}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => addPenalty(team)}
        className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-lg mb-4 flex items-center justify-center gap-2"
      >
        <Plus size={20} />
        Add Penalty
      </button>

      <div className="space-y-3">
        <h3 className="font-bold text-lg">Penalties</h3>
        {penalties.map((penalty, idx) => (
          <div key={penalty.id} className={`bg-white rounded-lg shadow-md p-4 border-2 ${penalty.submitted ? 'border-green-500' : 'border-gray-200'}`}>
            <div className="flex justify-between items-start mb-3">
              <div className="font-semibold">Penalty #{idx + 1}</div>
              <div className="flex gap-2">
                {!penalty.submitted && (
                  <button
                    onClick={() => submitPenalty(team, penalty.id)}
                    className="text-green-600 hover:text-green-700"
                  >
                    <Check size={20} />
                  </button>
                )}
                <button
                  onClick={() => deletePenalty(team, penalty.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Player *</label>
              <select
                value={penalty.player}
                onChange={(e) => updatePenalty(team, penalty.id, e.target.value)}
                disabled={penalty.submitted}
                className="w-full p-2 border rounded"
              >
                <option value="">Select Player</option>
                {players.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            
            <div className="text-sm text-gray-600 mt-2">
              Time: {penalty.timestamp}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const sortedStandings = Object.entries(teamStandings).sort((a, b) => {
    const [, statsA] = a;
    const [, statsB] = b;
    // Sort by wins first, then goal differential
    if (statsB.wins !== statsA.wins) return statsB.wins - statsA.wins;
    const diffA = statsA.goalsFor - statsA.goalsAgainst;
    const diffB = statsB.goalsFor - statsB.goalsAgainst;
    return diffB - diffA;
  });

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {!selectedGame ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-4xl font-bold text-center mb-8">Select a Game</h1>
            
            {/* Team Standings */}
            {sortedStandings.length > 0 && (
              <div className="mb-8 bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Trophy className="text-yellow-500" />
                  Team Standings
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-300">
                        <th className="text-left p-2">Team</th>
                        <th className="text-center p-2">W</th>
                        <th className="text-center p-2">L</th>
                        <th className="text-center p-2">T</th>
                        <th className="text-center p-2">GF</th>
                        <th className="text-center p-2">GA</th>
                        <th className="text-center p-2">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedStandings.map(([team, stats]) => (
                        <tr key={team} className="border-b">
                          <td className="p-2 font-semibold">{team}</td>
                          <td className="text-center p-2">{stats.wins}</td>
                          <td className="text-center p-2">{stats.losses}</td>
                          <td className="text-center p-2">{stats.ties}</td>
                          <td className="text-center p-2">{stats.goalsFor}</td>
                          <td className="text-center p-2">{stats.goalsAgainst}</td>
                          <td className="text-center p-2">{stats.goalsFor - stats.goalsAgainst}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Game Schedule */}
            <h2 className="text-2xl font-bold mb-4">Schedule</h2>
            <div className="space-y-4">
              {schedule.map(game => {
                const isCompleted = completedGames[game.id];
                return (
                  <button
                    key={game.id}
                    onClick={() => selectGame(game)}
                    className={`w-full p-6 rounded-lg shadow-md border-2 transition-all ${
                      isCompleted 
                        ? 'bg-green-50 border-green-500 hover:border-green-600' 
                        : 'bg-white border-gray-200 hover:border-blue-500'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="text-left">
                        <div className="text-xl font-bold mb-2 flex items-center gap-2">
                          {game.awayTeam} vs {game.homeTeam}
                          {isCompleted && <Check className="text-green-600" size={24} />}
                        </div>
                        <div className="text-gray-600">
                          {game.date} at {game.time}
                        </div>
                        {isCompleted && (
                          <div className="text-green-600 font-semibold mt-1">
                            Final: {completedGames[game.id].awayScore} - {completedGames[game.id].homeScore}
                          </div>
                        )}
                      </div>
                      <div className="text-blue-600 font-semibold">
                        {isCompleted ? 'View →' : 'Select →'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-blue-700 text-white p-4">
            <div className="flex justify-between items-center max-w-6xl mx-auto">
              <button
                onClick={() => setSelectedGame(null)}
                className="bg-blue-600 hover:bg-blue-800 px-4 py-2 rounded"
              >
                ← Back to Schedule
              </button>
              <div className="text-center flex-1">
                <h1 className="text-3xl font-bold">Scorekeeper's Dashboard</h1>
                <div className="text-sm mt-1">{selectedGame.date} at {selectedGame.time}</div>
                <div className="text-xl mt-2">{awayScore} - {homeScore}</div>
              </div>
              <button
                onClick={completeGame}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded flex items-center gap-2"
              >
                <Trophy size={20} />
                Complete Game
              </button>
            </div>
          </div>
          
          <div className="flex flex-1 overflow-hidden">
            <TeamSide 
              team="away" 
              score={awayScore} 
              goals={awayGoals} 
              penalties={awayPenalties}
              players={awayPlayers}
            />
            
            <div className="w-1 bg-gray-400"></div>
            
            <TeamSide 
              team="home" 
              score={homeScore} 
              goals={homeGoals} 
              penalties={homePenalties}
              players={homePlayers}
            />
          </div>

          {Object.keys(playerStats).length > 0 && (
            <div className="bg-white p-4 border-t shadow-lg">
              <h3 className="font-bold mb-2">Player Stats (Season Totals)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {Object.entries(playerStats)
                  .sort((a, b) => b[1].goals - a[1].goals)
                  .map(([player, stats]) => (
                    <div key={player} className="border p-2 rounded">
                      <div className="font-semibold">{player}</div>
                      <div>G: {stats.goals} | A: {stats.assists} | P: {stats.penalties}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ScorekeeperDashboard;