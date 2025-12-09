import { useQuery } from '@tanstack/react-query';
import type { IsometricCard } from '@shared/schema';

export function IsometricHeroDisplay() {
  const { data: cards = [] } = useQuery<IsometricCard[]>({
    queryKey: ['/api/isometric-cards'],
  });

  if (cards.length === 0) {
    return null;
  }

  return (
    <div 
      className="relative w-full h-[500px] md:h-[600px] overflow-hidden"
      style={{ perspective: '1200px' }}
      data-testid="isometric-hero-display"
    >
      {/* 3D Isometric Background Container */}
      <div 
        className="absolute inset-0"
        style={{
          transform: 'rotateX(12deg) rotateY(-8deg)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Dark 3D Wall Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 rounded-2xl shadow-2xl" />
        
        {/* Decorative 3D Blocks - Red and Gray */}
        <div 
          className="absolute -top-4 -right-4 w-24 h-24 bg-red-500 rounded-lg shadow-xl"
          style={{ transform: 'translateZ(40px)' }}
        />
        <div 
          className="absolute top-20 right-8 w-16 h-16 bg-gray-700 rounded-lg shadow-lg"
          style={{ transform: 'translateZ(20px)' }}
        />
        <div 
          className="absolute top-40 -right-2 w-20 h-20 bg-red-600 rounded-lg shadow-xl"
          style={{ transform: 'translateZ(30px)' }}
        />
        <div 
          className="absolute bottom-10 right-16 w-12 h-12 bg-gray-600 rounded-lg shadow-lg"
          style={{ transform: 'translateZ(15px)' }}
        />
        <div 
          className="absolute -bottom-4 -left-4 w-20 h-20 bg-red-500/80 rounded-lg shadow-xl"
          style={{ transform: 'translateZ(35px)' }}
        />
        <div 
          className="absolute bottom-32 left-8 w-14 h-14 bg-gray-800 rounded-lg shadow-lg"
          style={{ transform: 'translateZ(10px)' }}
        />

        {/* Floating Screenshot Cards */}
        {cards.map((card) => (
          <div
            key={card.id}
            className="absolute transition-all duration-300 hover:scale-105"
            style={{
              left: card.x,
              top: card.y,
              width: card.width,
              height: card.height,
              transform: `translateZ(${card.zIndex * 10}px) scale(${card.scale}) rotate(${card.rotation}deg)`,
              zIndex: card.zIndex,
            }}
            data-testid={`hero-card-${card.id}`}
          >
            <div className="w-full h-full bg-white rounded-xl shadow-2xl overflow-hidden border-4 border-white/90">
              <img
                src={card.imageUrl}
                alt="App screenshot"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
