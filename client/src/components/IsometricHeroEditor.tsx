import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Draggable, { DraggableData, DraggableEvent } from 'react-draggable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Move, Eye, EyeOff, Save, Upload } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { IsometricCard } from '@shared/schema';

export function IsometricHeroEditor() {
  const { toast } = useToast();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: cards = [], isLoading } = useQuery<IsometricCard[]>({
    queryKey: ['/api/isometric-cards/all'],
  });

  const createCardMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      return await apiRequest('/api/isometric-cards', {
        method: 'POST',
        body: JSON.stringify({ imageUrl, x: 100, y: 100, width: 200, height: 150 }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/isometric-cards/all'] });
      toast({ title: 'Card added' });
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<IsometricCard> }) => {
      return await apiRequest(`/api/isometric-cards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/isometric-cards/all'] });
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/isometric-cards/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/isometric-cards/all'] });
      setSelectedCardId(null);
      toast({ title: 'Card deleted' });
    },
  });

  const handleDragStop = useCallback((id: string, _e: DraggableEvent, data: DraggableData) => {
    updateCardMutation.mutate({ id, updates: { x: data.x, y: data.y } });
  }, [updateCardMutation]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.url) {
        createCardMutation.mutate(data.url);
      }
    } catch (error) {
      toast({ title: 'Upload failed', variant: 'destructive' });
    }
  };

  const handleUrlAdd = (url: string) => {
    if (url.trim()) {
      createCardMutation.mutate(url.trim());
    }
  };

  const selectedCard = cards.find(c => c.id === selectedCardId);

  if (isLoading) {
    return <div className="p-8 text-center">Loading editor...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Isometric Hero Editor</h1>
          <div className="flex gap-4">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                data-testid="input-upload-image"
              />
              <Button variant="outline" asChild>
                <span><Upload className="w-4 h-4 mr-2" /> Upload Image</span>
              </Button>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Canvas Area */}
          <div className="lg:col-span-3">
            <Card className="bg-gray-800 border-gray-700 p-4">
              <div
                ref={containerRef}
                className="relative bg-gradient-to-br from-gray-900 to-black rounded-lg overflow-hidden"
                style={{ 
                  height: '600px',
                  perspective: '1000px',
                }}
                data-testid="isometric-canvas"
              >
                {/* 3D Isometric Background */}
                <div 
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%)',
                    transform: 'rotateX(10deg) rotateY(-5deg)',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  {/* Decorative 3D blocks */}
                  <div className="absolute top-10 right-20 w-20 h-20 bg-red-500/30 rounded-lg shadow-lg" style={{ transform: 'translateZ(20px)' }} />
                  <div className="absolute top-40 right-10 w-16 h-16 bg-gray-700/50 rounded-lg shadow-lg" style={{ transform: 'translateZ(10px)' }} />
                  <div className="absolute bottom-20 left-20 w-24 h-24 bg-red-600/20 rounded-lg shadow-lg" style={{ transform: 'translateZ(30px)' }} />
                </div>

                {/* Draggable Cards */}
                {cards.map((card) => (
                  <Draggable
                    key={card.id}
                    position={{ x: card.x, y: card.y }}
                    onStop={(e, data) => handleDragStop(card.id, e, data)}
                    bounds="parent"
                  >
                    <div
                      className={`absolute cursor-move transition-shadow ${
                        selectedCardId === card.id ? 'ring-2 ring-blue-500' : ''
                      } ${!card.isVisible ? 'opacity-40' : ''}`}
                      style={{
                        width: card.width,
                        height: card.height,
                        transform: `scale(${card.scale}) rotate(${card.rotation}deg)`,
                        zIndex: card.zIndex,
                      }}
                      onClick={() => setSelectedCardId(card.id)}
                      data-testid={`card-${card.id}`}
                    >
                      <div className="w-full h-full bg-white rounded-lg shadow-2xl overflow-hidden border-2 border-white/20">
                        <img
                          src={card.imageUrl}
                          alt="Card"
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      </div>
                      <div className="absolute -top-6 left-0 bg-black/70 text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Move className="w-3 h-3" />
                        Drag to move
                      </div>
                    </div>
                  </Draggable>
                ))}
              </div>
            </Card>
          </div>

          {/* Properties Panel */}
          <div className="lg:col-span-1">
            <Card className="bg-gray-800 border-gray-700 p-4">
              <h2 className="text-lg font-semibold mb-4">Card Properties</h2>
              
              {selectedCard ? (
                <div className="space-y-4">
                  <div>
                    <Label>Image URL</Label>
                    <Input
                      value={selectedCard.imageUrl}
                      onChange={(e) => updateCardMutation.mutate({ 
                        id: selectedCard.id, 
                        updates: { imageUrl: e.target.value } 
                      })}
                      className="bg-gray-700 border-gray-600"
                      data-testid="input-image-url"
                    />
                  </div>

                  <div>
                    <Label>Width: {selectedCard.width}px</Label>
                    <Slider
                      value={[selectedCard.width]}
                      onValueChange={([value]) => updateCardMutation.mutate({ 
                        id: selectedCard.id, 
                        updates: { width: value } 
                      })}
                      min={50}
                      max={500}
                      step={10}
                      data-testid="slider-width"
                    />
                  </div>

                  <div>
                    <Label>Height: {selectedCard.height}px</Label>
                    <Slider
                      value={[selectedCard.height]}
                      onValueChange={([value]) => updateCardMutation.mutate({ 
                        id: selectedCard.id, 
                        updates: { height: value } 
                      })}
                      min={50}
                      max={500}
                      step={10}
                      data-testid="slider-height"
                    />
                  </div>

                  <div>
                    <Label>Scale: {selectedCard.scale}x</Label>
                    <Slider
                      value={[parseFloat(String(selectedCard.scale)) * 100]}
                      onValueChange={([value]) => updateCardMutation.mutate({ 
                        id: selectedCard.id, 
                        updates: { scale: String(value / 100) } 
                      })}
                      min={50}
                      max={200}
                      step={5}
                      data-testid="slider-scale"
                    />
                  </div>

                  <div>
                    <Label>Rotation: {selectedCard.rotation}°</Label>
                    <Slider
                      value={[selectedCard.rotation]}
                      onValueChange={([value]) => updateCardMutation.mutate({ 
                        id: selectedCard.id, 
                        updates: { rotation: value } 
                      })}
                      min={-45}
                      max={45}
                      step={1}
                      data-testid="slider-rotation"
                    />
                  </div>

                  <div>
                    <Label>Z-Index: {selectedCard.zIndex}</Label>
                    <Slider
                      value={[selectedCard.zIndex]}
                      onValueChange={([value]) => updateCardMutation.mutate({ 
                        id: selectedCard.id, 
                        updates: { zIndex: value } 
                      })}
                      min={1}
                      max={20}
                      step={1}
                      data-testid="slider-zindex"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Visible</Label>
                    <Switch
                      checked={selectedCard.isVisible}
                      onCheckedChange={(checked) => updateCardMutation.mutate({ 
                        id: selectedCard.id, 
                        updates: { isVisible: checked } 
                      })}
                      data-testid="switch-visible"
                    />
                  </div>

                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => deleteCardMutation.mutate(selectedCard.id)}
                    data-testid="button-delete-card"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Card
                  </Button>
                </div>
              ) : (
                <div className="text-gray-400 text-center py-8">
                  <p>Select a card to edit its properties</p>
                  <p className="text-sm mt-2">or upload a new image above</p>
                </div>
              )}

              {/* Add by URL */}
              <div className="mt-6 pt-4 border-t border-gray-700">
                <Label>Add Card by URL</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="https://..."
                    id="url-input"
                    className="bg-gray-700 border-gray-600"
                    data-testid="input-add-url"
                  />
                  <Button
                    size="icon"
                    onClick={() => {
                      const input = document.getElementById('url-input') as HTMLInputElement;
                      handleUrlAdd(input.value);
                      input.value = '';
                    }}
                    data-testid="button-add-url"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Cards List */}
            <Card className="bg-gray-800 border-gray-700 p-4 mt-4">
              <h2 className="text-lg font-semibold mb-4">All Cards ({cards.length})</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {cards.map((card, index) => (
                  <div
                    key={card.id}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                      selectedCardId === card.id ? 'bg-blue-600/20' : 'bg-gray-700/50 hover:bg-gray-700'
                    }`}
                    onClick={() => setSelectedCardId(card.id)}
                    data-testid={`card-list-item-${index}`}
                  >
                    <img src={card.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                    <div className="flex-1 truncate text-sm">Card {index + 1}</div>
                    {card.isVisible ? (
                      <Eye className="w-4 h-4 text-green-400" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
