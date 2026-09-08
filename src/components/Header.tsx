import React, { useState } from 'react';
import {
  Shield,
  Key,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Terminal,
  FileCheck,
  Server,
  Cpu,
  Layers
} from 'lucide-react';

interface HeaderProps {
  status: {
    status: string;
    identity?: {
      agent_id: string;
      principal_id: string;
      key_id: string;
      algorithm: string;
      public_key: string;
    };
    active_gos3_sessions: number;
    execution_proofs_count: number;
  } | null;
  onRotateKey: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onRotateKey,
  activeTab,
  setActiveTab,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);

  const copyPublicKey = () => {
    if (status?.identity?.public_key) {
      navigator.clipboard.writeText(status.identity.public_key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const navItems = [
    { id: 'vua-adapters', label: 'VUA Universal Adapters', icon: Layers },
    { id: 'workbench', label: 'MCP Workbench', icon: Terminal },
    { id: 'llm-gateway', label: 'Multi-LLM Gateway', icon: Cpu },
    { id: 'verifier', label: 'Independent Verifier', icon: Shield },
    { id: 'e2e', label: 'Foundation 10 E2E', icon: CheckCircle2 },
    { id: 'adversarial', label: 'Adversarial Suite', icon: FileCheck },
    { id: 'gos3', label: 'GOS3 & Sandbox', icon: Server },
    { id: 'ci-benchmark', label: 'CI Evidence & Benchmark', icon: RefreshCw },
  ];

  return (
    <header className="border-b border-zinc-800 bg-zinc-950 text-zinc-100 sticky top-0 z-40">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-700 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                VUA — VORTEX UNIVERSAL CONNECTOR
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-400">
                  MULTI-OS & VCS ADAPTERS
                </span>
              </h1>
            </div>
            <p className="text-xs text-zinc-400">
              Universal Adapters: GitHub • Linux POSIX • Android AOSP • Windows NT | RFC 8785 JCS • Ed25519
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3 text-xs">
          {status?.identity && (
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
              <Key className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-zinc-400">Key:</span>
              <span className="font-mono text-zinc-200">{status.identity.key_id}</span>
              <button
                onClick={copyPublicKey}
                className="text-indigo-400 hover:text-indigo-300 ml-1 underline"
                title="Copy Public Key PEM"
              >
                {copiedKey ? 'Copied!' : 'Copy PEM'}
              </button>
              <button
                onClick={onRotateKey}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition"
                title="Rotate Ed25519 Keypair"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-zinc-300 font-mono">POST /mcp</span>
            <a
              href="/.well-known/vortex-keys"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 ml-1"
              title="RFC Well-Known Keys"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="border-t border-zinc-800/80 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto gap-1 py-1 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-all ${
                  active
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-indigo-400' : 'text-zinc-400'}`} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
