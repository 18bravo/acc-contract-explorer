"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { name: "Contracts", href: "/contracts" },
  { name: "Budget", href: "/budget" },
  { name: "Waste", href: "/waste" },
  { name: "Risk", href: "/risk" },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex space-x-1">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-b-2 border-red-500 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
