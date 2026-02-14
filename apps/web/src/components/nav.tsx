"use client";

import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/evaluations", label: "Evaluations" },
  { href: "/arena", label: "Arena" },
  { href: "/traces", label: "Traces" },
  { href: "/red-team", label: "Red Team" },
  { href: "/scorer-lab", label: "Scorer Lab" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/domains", label: "Domains" },
  { href: "/cost", label: "Cost" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-800 px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600" />
          <span className="text-xl font-bold">SynthArena</span>
        </a>
        <div className="flex gap-6 text-sm text-gray-400">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={pathname?.startsWith(link.href) ? "text-white" : "hover:text-white"}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
