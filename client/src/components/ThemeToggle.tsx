import { useTheme } from '@/context/ThemeContext';
import { Switch } from '@/components/ui/switch';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLightMode = theme === 'light';

  return (
    <Switch
      checked={isLightMode}
      onCheckedChange={toggleTheme}
      aria-label="Toggle theme"
      data-testid="button-theme-toggle"
    />
  );
}
