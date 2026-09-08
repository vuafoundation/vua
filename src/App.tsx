import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { ProtocolWorkbench } from './components/ProtocolWorkbench.js';
import { IndependentVerifierView } from './components/IndependentVerifierView.js';
import { FoundationE2ESuite } from './components/FoundationE2ESuite.js';
import { AdversarialMatrix } from './components/AdversarialMatrix.js';
import { GOS3SandboxManager } from './components/GOS3SandboxManager.js';
import { CIBenchmarkGate } from './components/CIBenchmarkGate.js';
import type { ExecutionProof } from './vortex/types.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('workbench');
  const [status, setStatus] = useState<any>(null);
  const [selectedProofForVerification, setSelectedProofForVerification] = useState<ExecutionProof | null>(null);
  const [activeSessions, setActiveSessions] = useState<Array<{ session_id: string; resource: string }>>([]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/vortex/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch Vortex status:', err);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/vortex/gos3/sessions');
      const data = await res.json();
      setActiveSessions(data || []);
    } catch (err) {
      console.error('Failed to fetch GOS3 sessions:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchSessions();
  }, []);

  const handleRotateKey = async () => {
    try {
      await fetch('/api/vortex/keys/rotate', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendToVerifier = (proof: ExecutionProof) => {
    setSelectedProofForVerification(proof);
    setActiveTab('verifier');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <Header
        status={status}
        onRotateKey={handleRotateKey}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'workbench' && (
          <ProtocolWorkbench
            onSendToVerifier={handleSendToVerifier}
            activeSessions={activeSessions}
          />
        )}

        {activeTab === 'verifier' && (
          <IndependentVerifierView
            initialProof={selectedProofForVerification}
            recentProofs={status?.recent_proofs || []}
          />
        )}

        {activeTab === 'e2e' && <FoundationE2ESuite />}

        {activeTab === 'adversarial' && <AdversarialMatrix />}

        {activeTab === 'gos3' && (
          <GOS3SandboxManager
            onSessionCreated={() => {
              fetchSessions();
              fetchStatus();
            }}
          />
        )}

        {activeTab === 'ci-benchmark' && <CIBenchmarkGate />}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-4 px-6 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>Vortex Foundation Execution Governance Specification v1 • Open Protocol</span>
          <span className="font-mono text-[11px] text-zinc-400">
            SAFETY = AUTHORIZATION + BOUNDED EXECUTION + ACCOUNTABILITY + INDEPENDENT VERIFICATION + IDENTITY
          </span>
        </div>
      </footer>
    </div>
  );
}
