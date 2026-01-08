// src/app/(app)/layout.tsx
import { NavTabs } from "@/components/NavTabs";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-zinc-900">
      <header className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">WARWERX</span>
            </div>
            <NavTabs />
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}
