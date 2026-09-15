import Link from "next/link";

type Tab = {
  label: string;
  href: string;
};

type Props = {
  sport: string;
  activeTab: string;
  tabs: Tab[];
};

export function CompetitionNav({ sport, activeTab, tabs }: Props) {
  return (
    <nav className="comp-nav" aria-label="Navegación de competición">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`comp-nav-link${activeTab === tab.href ? " comp-nav-link--active" : ""}`}
          aria-current={activeTab === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
