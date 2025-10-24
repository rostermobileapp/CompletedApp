import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Switch } from '@/components/ui/switch';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLightMode = theme === 'light';

  return (
    <div className="flex items-center gap-2" data-testid="theme-toggle-container">
      <Moon 
        className={`h-4 w-4 transition-colors ${isLightMode ? 'text-muted-foreground' : 'text-primary'}`} 
        data-testid="icon-moon" 
      />
      <Switch
        checked={isLightMode}
        onCheckedChange={toggleTheme}
        aria-label="Toggle theme"
        data-testid="button-theme-toggle"
      />
      <Sun 
        className={`h-4 w-4 transition-colors ${isLightMode ? 'text-primary' : 'text-muted-foreground'}`} 
        data-testid="icon-sun" 
      />
      <span className="sr-only">Toggle theme</span>
    </div>
  );
}
