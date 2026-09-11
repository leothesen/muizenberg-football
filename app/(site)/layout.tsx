import { SiteFooter, SiteHeader } from "@/components/site";

/** The public website's chrome. The Mini App sits outside this group on purpose. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
