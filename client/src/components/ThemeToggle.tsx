import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      className="rounded-full"
    >
      {theme === 'light' ? (
        <Moon className="h-5 w-5" data-testid="icon-moon" />
      ) : (
        <Sun className="h-5 w-5" data-testid="icon-sun" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
