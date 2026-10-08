import { useEffect, useState, useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  return reduced;
}

// ---------- Animated bracket (app-style card layout) ----------
const B_CW = 134; // card width px
const B_CH = 94;  // card height px
const B_COL_GAP = 48; // horizontal gap between columns (for connector lines)

function BracketCard({
  x, y, label, round, team1, team2, winner,
}: {
  x: number; y: number; label: string; round: string;
  team1: string; team2: string; winner: string | null;
}) {
  const t1Win = !!winner && winner === team1 && team1 !== '';
  const t2Win = !!winner && winner === team2 && team2 !== '';
  const isWon = t1Win || t2Win;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: B_CW,
        height: B_CH,
        borderRadius: 10,
        border: `2px solid ${isWon ? '#22c55e' : '#e5e7eb'}`,
        boxShadow: isWon
          ? '0 0 0 3px rgba(34,197,94,0.15), 0 0 18px rgba(34,197,94,0.4)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        background: '#ffffff',
        padding: '7px 8px',
        boxSizing: 'border-box' as const,
        transition: 'border-color 0.5s ease, box-shadow 0.5s ease',
        fontFamily: 'Inter, ui-sans-serif, sans-serif',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{label}</div>
          <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.3 }}>{round}</div>
        </div>
        {isWon && (
          <span style={{
            fontSize: 7, fontWeight: 800, color: '#16a34a', background: '#f0fdf4',
            borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em',
          }}>WIN</span>
        )}
      </div>
      {/* Team 1 pill */}
      <div style={{
        borderRadius: 20, padding: '3.5px 8px', fontSize: 9.5,
        fontWeight: t1Win ? 700 : 500,
        color: t1Win ? '#15803d' : (team1 ? '#374151' : '#d1d5db'),
        background: t1Win ? '#dcfce7' : '#f3f4f6',
        marginBottom: 3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontStyle: team1 ? 'normal' : 'italic',
        transition: 'background 0.45s ease, color 0.45s ease',
      }}>
        {team1 || 'TBD'}
      </div>
      {/* vs */}
      <div style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center', lineHeight: 1, marginBottom: 3 }}>vs</div>
      {/* Team 2 pill */}
      <div style={{
        borderRadius: 20, padding: '3.5px 8px', fontSize: 9.5,
        fontWeight: t2Win ? 700 : 500,
        color: t2Win ? '#15803d' : (team2 ? '#374151' : '#d1d5db'),
        background: t2Win ? '#dcfce7' : '#f3f4f6',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontStyle: team2 ? 'normal' : 'italic',
        transition: 'background 0.45s ease, color 0.45s ease',
      }}>
        {team2 || 'TBD'}
      </div>
    </div>
  );
}

export function AnimatedBracket() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-200px' });
  const reduced = useReducedMotion();
  // stage -1 = not started, 0–6 = sequence steps
  const [stage, setStage] = useState(-1);

  useEffect(() => {
    if (!inView) return;
    if (reduced) { setStage(6); return; }
    const delays = [800, 1700, 2600, 3500, 4600, 5700, 6900];
    const timers = delays.map((d, i) => setTimeout(() => setStage(i), d));
    return () => timers.forEach(clearTimeout);
  }, [inView, reduced]);

  const CW = B_CW;
  const CH = B_CH;
  const GAP = B_COL_GAP;
  const PAIR_GAP = 10;   // gap between cards in the same QF pair
  const GROUP_SEP = 46;  // extra gap between the two QF pairs

  // QF top-y positions
  const qY = [
    0,
    CH + PAIR_GAP,
    CH * 2 + PAIR_GAP + GROUP_SEP,
    CH * 3 + PAIR_GAP * 2 + GROUP_SEP,
  ];

  // Center-y of each QF card
  const qCY = qY.map(y => y + CH / 2);

  // SF: centered between each paired QF
  const sCY = [(qCY[0] + qCY[1]) / 2, (qCY[2] + qCY[3]) / 2];
  const sY  = sCY.map(cy => Math.round(cy - CH / 2));

  // Final: centered between the two SF cards
  const fCY = (sCY[0] + sCY[1]) / 2;
  const fY  = Math.round(fCY - CH / 2);

  // Column x positions
  const col  = [0, CW + GAP, (CW + GAP) * 2];
  // X midpoint of each connector gap (where the vertical trunk sits)
  const midX = [col[0] + CW + Math.round(GAP / 2), col[1] + CW + Math.round(GAP / 2)];

  const totalW = col[2] + CW;
  const totalH = qY[3] + CH + 26; // extra room for champion label

  // Each connector: [SVG path d, stage threshold to trigger animation]
  // Path format: winner exits card-right → horizontal to midX → vertical to next-round centerY → horizontal to next-card-left
  const connectors: Array<[string, number]> = [
    [`M ${col[0] + CW} ${qCY[0]} H ${midX[0]} V ${sCY[0]} H ${col[1]}`, 0], // QF0 winner → SF0
    [`M ${col[0] + CW} ${qCY[1]} H ${midX[0]} V ${sCY[0]} H ${col[1]}`, 1], // QF1 winner → SF0
    [`M ${col[0] + CW} ${qCY[2]} H ${midX[0]} V ${sCY[1]} H ${col[1]}`, 2], // QF2 winner → SF1
    [`M ${col[0] + CW} ${qCY[3]} H ${midX[0]} V ${sCY[1]} H ${col[1]}`, 3], // QF3 winner → SF1
    [`M ${col[1] + CW} ${sCY[0]} H ${midX[1]} V ${fCY} H ${col[2]}`, 4],    // SF0 winner → Final
    [`M ${col[1] + CW} ${sCY[1]} H ${midX[1]} V ${fCY} H ${col[2]}`, 5],    // SF1 winner → Final
  ];

  const qfData = [
    { label: 'Game 1', round: 'Quarterfinals', t1: 'Ice Dogs',   t2: 'Pucks',      w: 'Ice Dogs',   ws: 0 },
    { label: 'Game 2', round: 'Quarterfinals', t1: 'Frostbites', t2: 'Slapshots',  w: 'Slapshots',  ws: 1 },
    { label: 'Game 3', round: 'Quarterfinals', t1: 'Bardowns',   t2: 'Hat Tricks', w: 'Hat Tricks', ws: 2 },
    { label: 'Game 4', round: 'Quarterfinals', t1: 'Five Hole',  t2: 'Top Shelf',  w: 'Top Shelf',  ws: 3 },
  ];

  return (
    <div ref={ref} style={{ overflowX: 'auto' }}>
      <div style={{ position: 'relative', width: totalW, height: totalH, margin: '0 auto' }}>

        {/* ── SVG connector layer ── */}
        <svg
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          width={totalW}
          height={totalH}
        >
          {connectors.map(([d, trig], i) => (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke="#3c82f4"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              animate={stage >= trig ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeInOut' }}
            />
          ))}
          {/* Arrow tips at the entry of each next-round card */}
          {[
            { x: col[1], y: sCY[0], trig: 1 },  // → SF0 (after both QF0+QF1 done)
            { x: col[1], y: sCY[1], trig: 3 },  // → SF1
            { x: col[2], y: fCY,    trig: 5 },  // → Final
          ].map(({ x, y, trig }, i) => (
            <motion.polygon
              key={`arr-${i}`}
              points={`${x},${y - 4} ${x + 7},${y} ${x},${y + 4}`}
              fill="#3c82f4"
              initial={{ opacity: 0 }}
              animate={{ opacity: stage >= trig ? 1 : 0 }}
              transition={{ duration: 0.25, delay: 0.45 }}
            />
          ))}
        </svg>

        {/* ── QF Cards ── */}
        {qfData.map((g, i) => (
          <BracketCard
            key={g.label}
            x={col[0]} y={qY[i]}
            label={g.label} round={g.round}
            team1={g.t1} team2={g.t2}
            winner={stage >= g.ws ? g.w : null}
          />
        ))}

        {/* ── SF Cards ── */}
        <BracketCard
          x={col[1]} y={sY[0]}
          label="Game 5" round="Semifinals"
          team1={stage >= 0 ? 'Ice Dogs'  : ''}
          team2={stage >= 1 ? 'Slapshots' : ''}
          winner={stage >= 4 ? 'Ice Dogs' : null}
        />
        <BracketCard
          x={col[1]} y={sY[1]}
          label="Game 6" round="Semifinals"
          team1={stage >= 2 ? 'Hat Tricks' : ''}
          team2={stage >= 3 ? 'Top Shelf'  : ''}
          winner={stage >= 5 ? 'Hat Tricks' : null}
        />

        {/* ── Final Card ── */}
        <BracketCard
          x={col[2]} y={fY}
          label="Final" round="Championship"
          team1={stage >= 4 ? 'Ice Dogs'   : ''}
          team2={stage >= 5 ? 'Hat Tricks' : ''}
          winner={stage >= 6 ? 'Ice Dogs'  : null}
        />

        {/* ── Champion label ── */}
        <AnimatePresence>
          {stage >= 6 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.3 }}
              style={{
                position: 'absolute',
                left: col[2],
                top: fY + CH + 6,
                width: CW,
                textAlign: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#3c82f4',
                fontFamily: 'Inter, ui-sans-serif, sans-serif',
              }}
            >
              🏒 Champions
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

