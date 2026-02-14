import { Nav } from "../components/nav";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Nav />

      {/* Hero */}
      <main className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight">
            Test your AI agents before they
            <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent"> touch production</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
            Generate millions of realistic test scenarios, run agents in sandboxed environments,
            and evaluate performance with pass@k and pass^k reliability metrics.
          </p>

          <div className="mt-10 flex justify-center gap-4">
            <a
              href="/evaluations"
              className="rounded-lg bg-gradient-to-r from-orange-500 to-red-600 px-6 py-3 font-medium text-white hover:opacity-90"
            >
              Start Evaluation
            </a>
            <a
              href="/arena"
              className="rounded-lg border border-gray-700 px-6 py-3 font-medium text-gray-300 hover:border-gray-500"
            >
              Arena Mode
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-4 gap-6">
          {[
            { label: "Domains", value: "5", sub: "web, gov, health, legal, energy" },
            { label: "Graders", value: "18+", sub: "code + LLM + red team" },
            { label: "Metrics", value: "pass@k", sub: "capability + reliability" },
            { label: "Compliance", value: "EU AI Act", sub: "automated reports" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <div className="text-3xl font-bold text-white">{stat.value}</div>
              <div className="mt-1 text-sm font-medium text-gray-400">{stat.label}</div>
              <div className="mt-1 text-xs text-gray-600">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-3 gap-8">
          {[
            {
              title: "Scenario Generation",
              desc: "LLM-powered generation of domain-specific test scenarios with quality validation and diversity scoring.",
              icon: "🎯",
            },
            {
              title: "Sandboxed Execution",
              desc: "Docker + Firecracker isolation with mock websites, APIs, and databases for safe agent testing.",
              icon: "🛡️",
            },
            {
              title: "State-Diff Engine",
              desc: "Compare environment snapshots before/after agent execution. Grade on observable mutations, not step sequences.",
              icon: "🔬",
            },
            {
              title: "Replay & Regression",
              desc: "Re-run agents against identical scenarios after code changes. Detect behavioral drift automatically.",
              icon: "🔄",
            },
            {
              title: "Red Team Suite",
              desc: "6 adversarial scorers: injection resistance, data leakage, tool misuse prevention, hallucination detection, and more.",
              icon: "⚔️",
            },
            {
              title: "Cost Modeling",
              desc: "Estimate token spend before running agents live. Get optimization recommendations automatically.",
              icon: "💰",
            },
            {
              title: "EU AI Act Compliance",
              desc: "Auto-generate compliance reports aligned with Articles 9, 10, 15, and Annex IV. Risk classification by domain.",
              icon: "📋",
            },
          ].map((feature) => (
            <div key={feature.title} className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <div className="text-2xl">{feature.icon}</div>
              <h3 className="mt-3 text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* CLI Example */}
        <div className="mt-20">
          <h2 className="text-center text-2xl font-bold text-white">CLI-First Experience</h2>
          <div className="mx-auto mt-8 max-w-2xl rounded-xl border border-gray-800 bg-gray-900 p-6 font-mono text-sm">
            <div className="text-gray-500"># Generate and evaluate</div>
            <div className="text-green-400">$ synth-arena run --domain web-scraping --scenarios 1000</div>
            <div className="mt-4 text-gray-500"># Head-to-head comparison</div>
            <div className="text-green-400">$ synth-arena arena --agents v1,v2 --scenarios 100</div>
            <div className="mt-4 text-gray-500"># Estimate costs before running</div>
            <div className="text-green-400">$ synth-arena cost --domain healthcare --scenarios 500</div>
            <div className="mt-4 text-gray-500"># Red team adversarial testing</div>
            <div className="text-green-400">$ synth-arena red-team --domain healthcare --intensity high</div>
            <div className="mt-4 text-gray-500"># EU AI Act compliance report</div>
            <div className="text-green-400">$ synth-arena compliance --domain healthcare --scenarios 100</div>
          </div>
        </div>
      </main>
    </div>
  );
}
