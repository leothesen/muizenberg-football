import { SiteFooter, SiteHeader } from "@/components/site";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The public website's chrome. The Mini App sits outside this group on purpose.
 *
 * The theme toggle lives here rather than in the root layout, so it appears on the
 * website and not inside Telegram — a Mini App sits in a client that already has its
 * own light and dark setting, and a second control for the same thing in the corner
 * of somebody's chat is clutter. Both still follow the system on their own.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
      <ThemeToggle />
    </div>
  );
}
