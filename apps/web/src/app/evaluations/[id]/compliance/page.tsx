"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "../../../../components/nav";

interface ComplianceCheck {
  article: string;
  requirement: string;
  status: "met" | "not-met" | "partial" | "not-applicable";
  evidence: string;
  severity: "critical" | "major" | "minor";
}

interface TestMetric {
  score: number;
  status: "pass" | "fail" | "warning" | "not-tested";
  details: string;
  threshold: number;
}

interface ComplianceReport {
  id: string;
  generatedAt: string;
  framework: string;
  overallStatus: "compliant" | "non-compliant" | "partial";
  systemInfo: { name: string; evaluationRunId: string; domain: string; scenarioCount: number; trialCount: number; evaluatedAt: string };
  riskClassification: { level: string; reason: string; articles: string[] };
  testingSummary: Record<string, TestMetric>;
  checks: ComplianceCheck[];
  recommendations: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    met: "bg-green-900/50 text-green-400",
    compliant: "bg-green-900/50 text-green-400",
    pass: "bg-green-900/50 text-green-400",
    partial: "bg-yellow-900/50 text-yellow-400",
    warning: "bg-yellow-900/50 text-yellow-400",
    "not-met": "bg-red-900/50 text-red-400",
    "non-compliant": "bg-red-900/50 text-red-400",
    fail: "bg-red-900/50 text-red-400",
    "not-tested": "bg-gray-800 text-gray-500",
    "not-applicable": "bg-gray-800 text-gray-500",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-800 text-gray-400"}`}>
      {status}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "text-red-400",
    major: "text-yellow-400",
    minor: "text-gray-500",
  };
  return <span className={`text-lg ${colors[severity] ?? "text-gray-500"}`}>●</span>;
}

export default function CompliancePage() {
  const params = useParams();
  const id = params.id as string;
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch(`${API_BASE}/evaluations/${id}/compliance`);
        const json = await res.json();
        if (json.data) setReport(json.data);
        else setError(json.error?.message ?? "Failed to load compliance report");
      } catch {
        setError("Unable to connect to API. Start the API server to generate compliance reports.");
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-5xl px-6 py-10">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-80 rounded bg-gray-800" />
            <div className="grid grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-lg bg-gray-800" />)}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-5xl px-6 py-10">
          <a href={`/evaluations/${id}`} className="text-sm text-gray-500 hover:text-gray-300">&larr; Back to evaluation</a>
          <h1 className="mt-4 text-2xl font-bold">Compliance Report</h1>
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-red-400">
            {error ?? "Report not available"}
          </div>
        </main>
      </div>
    );
  }

  const metPct = ((report.checks.filter((c) => c.status === "met").length / report.checks.length) * 100).toFixed(0);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <a href={`/evaluations/${id}`} className="text-sm text-gray-500 hover:text-gray-300">&larr; Back to evaluation</a>

        {/* Header */}
        <div className="mt-4 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">EU AI Act Compliance</h1>
            <p className="mt-1 text-sm text-gray-500">
              {report.systemInfo.name} &middot; {report.systemInfo.domain} &middot; Generated {new Date(report.generatedAt).toLocaleString()}
            </p>
          </div>
          <StatusBadge status={report.overallStatus} />
        </div>

        {/* Risk + Summary Cards */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="text-xs uppercase tracking-wider text-gray-500">Risk Level</div>
            <div className={`mt-1 text-2xl font-bold ${report.riskClassification.level === "high" ? "text-red-400" : "text-yellow-400"}`}>
              {report.riskClassification.level.toUpperCase()}
            </div>
            <div className="mt-1 text-xs text-gray-500">{report.riskClassification.reason}</div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="text-xs uppercase tracking-wider text-gray-500">Checks Passed</div>
            <div className="mt-1 text-2xl font-bold text-gray-100">{metPct}%</div>
            <div className="mt-1 text-xs text-gray-500">
              {report.checks.filter((c) => c.status === "met").length} of {report.checks.length} requirements met
            </div>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="text-xs uppercase tracking-wider text-gray-500">Test Coverage</div>
            <div className="mt-1 text-2xl font-bold text-gray-100">
              {report.systemInfo.scenarioCount} scenarios
            </div>
            <div className="mt-1 text-xs text-gray-500">{report.systemInfo.trialCount} trials total</div>
          </div>
        </div>

        {/* Testing Summary */}
        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold">Testing Summary</h2>
          <div className="mt-4 space-y-3">
            {Object.entries(report.testingSummary).map(([name, metric]) => (
              <div key={name} className="flex items-center gap-4">
                <span className="w-36 text-sm capitalize text-gray-400">{name.replace(/([A-Z])/g, " $1")}</span>
                <StatusBadge status={metric.status} />
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-gray-800">
                    <div
                      className={`h-2 rounded-full ${
                        metric.status === "pass" ? "bg-green-500" : metric.status === "warning" ? "bg-yellow-500" : metric.status === "fail" ? "bg-red-500" : "bg-gray-700"
                      }`}
                      style={{ width: `${Math.max(metric.score * 100, 2)}%` }}
                    />
                  </div>
                </div>
                <span className="w-16 text-right text-sm font-medium text-gray-300">{(metric.score * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance Checks */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Article-by-Article Checks</h2>
          <div className="mt-4 space-y-2">
            {report.checks.map((check, i) => (
              <div key={i} className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <SeverityIcon severity={check.severity} />
                  <span className="w-28 text-sm font-medium text-gray-300">{check.article}</span>
                  <StatusBadge status={check.status} />
                  <span className="flex-1 text-sm text-gray-400">{check.requirement}</span>
                </div>
                <p className="mt-1 ml-9 text-xs text-gray-600">{check.evidence}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        {report.recommendations.length > 0 && (
          <div className="mt-8 rounded-xl border border-orange-500/20 bg-orange-950/10 p-6">
            <h2 className="text-lg font-semibold text-orange-400">Recommendations</h2>
            <ul className="mt-3 space-y-2">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-300">
                  <span className="text-orange-400">→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
