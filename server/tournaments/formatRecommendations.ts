export interface FormatRecommendation {
  format: 'single_elimination' | 'double_elimination' | 'round_robin' | 'round_robin_split';
  recommended: boolean;
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedGames: number;
}

/**
 * Get format recommendations based on number of teams
 */
export function getFormatRecommendations(numTeams: number): FormatRecommendation[] {
  const recommendations: FormatRecommendation[] = [];

  // Check if power of 2 (perfect for single elimination)
  const isPowerOf2 = (numTeams & (numTeams - 1)) === 0 && numTeams > 0;

  // Single Elimination
  const singleElimGames = numTeams - 1;
  recommendations.push({
    format: 'single_elimination',
    recommended: isPowerOf2 || numTeams >= 8,
    name: 'Single Elimination',
    description: 'Traditional bracket where one loss eliminates a team',
    pros: [
      'Fast tournament completion',
      'Clear advancement path',
      'Exciting do-or-die format',
      isPowerOf2 ? 'Perfect bracket size' : 'Works with any team count'
    ],
    cons: [
      'Teams only get one game if eliminated early',
      !isPowerOf2 ? 'Some teams will receive byes' : ''
    ].filter(Boolean),
    estimatedGames: singleElimGames
  });

  // Double Elimination
  if (numTeams >= 4 && numTeams <= 32) {
    const doubleElimGames = Math.ceil((numTeams * 2) - 2);
    recommendations.push({
      format: 'double_elimination',
      recommended: numTeams >= 6 && numTeams <= 16,
      name: 'Double Elimination',
      description: 'Teams must lose twice to be eliminated - includes winners and losers brackets',
      pros: [
        'Every team plays at least 2 games',
        'More forgiving format',
        'True champion must win consistently'
      ],
      cons: [
        'Longer tournament duration',
        'Complex bracket structure',
        'Requires more games'
      ],
      estimatedGames: doubleElimGames
    });
  }

  // Round Robin
  const roundRobinGames = (numTeams * (numTeams - 1)) / 2;
  if (numTeams <= 12) {
    recommendations.push({
      format: 'round_robin',
      recommended: numTeams >= 3 && numTeams <= 8,
      name: 'Round Robin',
      description: 'Every team plays every other team once',
      pros: [
        'Fairest format - everyone plays same opponents',
        'Most games per team',
        'Clear standings based on record'
      ],
      cons: [
        numTeams > 8 ? 'Many games required' : '',
        'Can take longer to complete',
        'Less dramatic than elimination'
      ].filter(Boolean),
      estimatedGames: roundRobinGames
    });
  }

  // Round Robin Split
  if (numTeams >= 12) {
    const divisionGames = Math.ceil(roundRobinGames / 2) + 3; // Division play + 3 playoff games
    recommendations.push({
      format: 'round_robin_split',
      recommended: numTeams >= 13 && numTeams <= 24,
      name: 'Round Robin with Divisions',
      description: 'Divide into divisions for round robin play, then playoffs between division leaders',
      pros: [
        'Manageable game count',
        'Fair within divisions',
        'Exciting playoff finale'
      ],
      cons: [
        'Divisions may be unbalanced',
        'Teams don\'t play everyone',
        'More complex structure'
      ],
      estimatedGames: divisionGames
    });
  }

  // Sort: recommended first, then by estimated games
  return recommendations.sort((a, b) => {
    if (a.recommended && !b.recommended) return -1;
    if (!a.recommended && b.recommended) return 1;
    return a.estimatedGames - b.estimatedGames;
  });
}

/**
 * Get the default/best format for a given team count
 */
export function getDefaultFormat(numTeams: number): FormatRecommendation['format'] {
  const recommendations = getFormatRecommendations(numTeams);
  const recommended = recommendations.find(r => r.recommended);
  return recommended?.format || 'single_elimination';
}
