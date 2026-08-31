import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

/** Exasol Studio theme toggle — MagicUI's animated (view-transition) toggler
 * wired to our ThemeProvider so persistence stays in one place. */
export function ThemeToggle({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const { theme, setTheme } = useTheme();
  return (
    <AnimatedThemeToggler
      theme={theme}
      onThemeChange={setTheme}
      duration={450}
      style={style}
      className={cn(
        "flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground [&_svg]:h-3.5 [&_svg]:w-3.5",
        className,
      )}
    />
  );
}
