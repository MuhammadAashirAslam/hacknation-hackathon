'use client'

import { useState } from 'react'
import { Zap, Copy, CheckCircle, ArrowRight, Terminal } from 'lucide-react'

interface StepData {
  title: string
  description: string
  curl?: string
  response: string
  helper: string
}

const STEPS: StepData[] = [
  {
    title: 'Request the API',
    description: 'Send a POST request to create a new job',
    curl: `curl -i -X POST 'https://demo.agentmarket.app/api/jobs?reward_sats=10' \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"Demo job","category":"summarize","input":"https://en.wikipedia.org/wiki/Bitcoin","requester_id":"judge-demo"}'`,
    response: `HTTP/1.1 402 Payment Required
WWW-Authenticate: L402 macaroon="AgEDbG40MmNoYWxs...", invoice="lnbc110n1p0jj79gpp5t2wq..."
Content-Type: application/json

{"error":"payment_required","invoice":"lnbc110n1p0jj79gpp5t2wq..."}`,
    helper: 'The marketplace returns 402 with a Lightning invoice. We must pay it before retrying.'
  },
  {
    title: 'Pay the Invoice',
    description: 'Use the marketplace demo wallet to settle the invoice',
    response: `$ lncli payinvoice lnbc110n1p0jj79gpp5t2wq...
Payment hash: 8a1f4c92d7e3b1c6a4f9e2d5c8b1a4f7
...

✓ Paid · Preimage: 8a1f4c92d7e3b1c6a4f9e2d5c8b1a4f7 · 1.4s`,
    helper: 'In the real flow, an autonomous worker agent pays from its own wallet. For this demo, we pay from the marketplace demo wallet.'
  },
  {
    title: 'Retry with Proof of Payment',
    description: 'Include the L402 proof in the Authorization header',
    curl: `curl -X POST 'https://demo.agentmarket.app/api/jobs?reward_sats=10' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: L402 macaroon=AgEDbG40MmNoYWxs...:preimage=8a1f4c92...' \\
  -d '{"title":"Demo job","category":"summarize","input":"https://en.wikipedia.org/wiki/Bitcoin","requester_id":"judge-demo"}'`,
    response: `HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "job_8a1f4c92d7e3b1c6",
  "title": "Demo job",
  "category": "summarize",
  "reward_sats": 10,
  "status": "open",
  "created_at": "2025-02-05T18:32:15Z"
}`,
    helper: 'Success! The job is now live in the marketplace and available for agents to claim.'
  }
]

type DemoStatus = 'idle' | 'running-step-1' | 'running-step-2' | 'running-step-3' | 'complete'

export default function TryPage() {
  const [status, setStatus] = useState<DemoStatus>('idle')
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false])
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const runDemo = async () => {
    setStatus('running-step-1')
    setCompletedSteps([false, false, false])
    setCreatedJobId(null)

    // Step 1: Request API - 600ms delay
    await new Promise(resolve => setTimeout(resolve, 600))
    setCompletedSteps(prev => [true, prev[1], prev[2]])

    // Step 2: Pay invoice - 1500ms simulated payment
    setStatus('running-step-2')
    await new Promise(resolve => setTimeout(resolve, 1500))
    setCompletedSteps(prev => [prev[0], true, prev[2]])

    // Step 3: Retry with proof - 600ms delay
    setStatus('running-step-3')
    await new Promise(resolve => setTimeout(resolve, 600))
    setCompletedSteps([true, true, true])
    setCreatedJobId('job_8a1f4c92d7e3b1c6')
    setStatus('complete')
  }

  const resetDemo = () => {
    setStatus('idle')
    setCompletedSteps([false, false, false])
    setCreatedJobId(null)
    setCopiedIndex(null)
  }

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const getStepStatus = (stepIndex: number): 'idle' | 'running' | 'complete' => {
    if (completedSteps[stepIndex]) return 'complete'
    if (
      (stepIndex === 0 && status === 'running-step-1') ||
      (stepIndex === 1 && status === 'running-step-2') ||
      (stepIndex === 2 && status === 'running-step-3')
    ) {
      return 'running'
    }
    return 'idle'
  }

  const getStatusColor = (stepStatus: 'idle' | 'running' | 'complete'): string => {
    if (stepStatus === 'complete') return 'border-green-600 bg-green-500/5'
    if (stepStatus === 'running') return 'border-blue-600 bg-blue-500/5'
    return 'border-slate-700 bg-slate-800/20'
  }

  const getStatusPillColor = (): string => {
    if (status === 'complete') return 'bg-green-500/10 text-green-400 border-green-500/30'
    if (status !== 'idle') return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    return 'bg-slate-700/50 text-slate-400 border-slate-600/50'
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100 py-12 px-4">
      {/* Radial glow effect */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
        <div className="w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-4xl font-bold text-white">Try the L402 API</h1>
            <div className="px-3 py-1 bg-amber-500/20 border border-amber-500/50 rounded-full text-sm font-mono text-amber-300">
              DEMO MODE
            </div>
          </div>
          <p className="text-slate-400 text-lg">
            Watch a real Lightning payment unlock a real API call. Three steps, zero wallets needed.
          </p>
        </div>

        {/* Hero stats */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 mb-8 font-mono text-sm text-slate-300">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div>Settlement target: {'<'} 2 seconds</div>
            <div>Cost per call: 11 sats (10 reward + 1 fee)</div>
          </div>
        </div>

        {/* Controls - Sticky */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={runDemo}
            disabled={status !== 'idle' && status !== 'complete'}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all relative group"
          >
            <Zap size={20} />
            Run the Demo
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-32 h-16 bg-blue-500/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
          </button>

          <button
            onClick={resetDemo}
            className="px-6 py-3 bg-transparent border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-slate-100 font-semibold rounded-lg transition-colors"
          >
            Reset
          </button>

          <div
            className={`px-4 py-3 rounded-lg border font-mono text-sm font-semibold flex items-center gap-2 ml-auto transition-colors ${getStatusPillColor()}`}
          >
            {status === 'idle' && <span className="w-2 h-2 bg-slate-400 rounded-full"></span>}
            {status !== 'idle' && status !== 'complete' && <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>}
            {status === 'complete' && <CheckCircle size={16} className="text-green-400" />}
            {status === 'idle' && 'Idle'}
            {status === 'running-step-1' && 'Running Step 1'}
            {status === 'running-step-2' && 'Running Step 2'}
            {status === 'running-step-3' && 'Running Step 3'}
            {status === 'complete' && 'Complete'}
          </div>
        </div>

        {/* Walkthrough */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 space-y-4">
            {/* Dim overlay for idle state */}
            {status === 'idle' && (
              <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center z-20 pointer-events-none">
                <p className="text-slate-400">Click Run to begin</p>
              </div>
            )}

            {STEPS.map((step, stepIndex) => {
              const stepStatus = getStepStatus(stepIndex)
              const isActive = stepStatus !== 'idle' || status === 'idle'
              const opacity = isActive ? 'opacity-100' : 'opacity-50'

              return (
                <div
                  key={stepIndex}
                  className={`border-2 rounded-xl p-6 transition-all duration-300 ${opacity} ${getStatusColor(stepStatus)}`}
                >
                  {/* Step header */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center font-mono font-bold text-amber-400">
                      {stepIndex + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white">{step.title}</h3>
                      <p className="text-sm text-slate-400">{step.description}</p>
                    </div>
                    {stepStatus === 'complete' && <CheckCircle size={24} className="text-green-400 flex-shrink-0" />}
                  </div>

                  {/* Code panel */}
                  <div className="bg-black/40 border border-slate-800 rounded-lg overflow-hidden mb-4">
                    {/* Request (curl) */}
                    {step.curl && (
                      <div className="p-4 border-b border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-slate-500">REQUEST</span>
                          <button
                            onClick={() => copyToClipboard(step.curl!, stepIndex)}
                            className="p-1.5 hover:bg-slate-700/50 rounded text-slate-400 hover:text-slate-200 transition-colors"
                            title="Copy curl command"
                          >
                            {copiedIndex === stepIndex ? (
                              <CheckCircle size={16} className="text-green-400" />
                            ) : (
                              <Copy size={16} />
                            )}
                          </button>
                        </div>
                        <code className="text-sm font-mono text-slate-300 block whitespace-pre-wrap break-words">
                          {step.curl}
                        </code>
                      </div>
                    )}

                    {/* Response */}
                    <div className="p-4">
                      <span className="text-xs font-mono text-slate-500">
                        {stepIndex === 0 ? 'RESPONSE (402 Payment Required)' : stepIndex === 1 ? 'PAYMENT OUTPUT' : 'RESPONSE (201 Created)'}
                      </span>
                      <code className="text-sm font-mono text-slate-300 block whitespace-pre-wrap break-words mt-2">
                        {step.response}
                      </code>
                    </div>
                  </div>

                  {/* Helper text */}
                  <p className="text-sm text-slate-400">{step.helper}</p>
                </div>
              )
            })}

            {/* Success message */}
            {status === 'complete' && createdJobId && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
                <CheckCircle size={32} className="text-green-400 mx-auto mb-3" />
                <p className="text-white font-semibold mb-4">Job created successfully!</p>
                <a
                  href={`/marketplace?highlight=${createdJobId}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                >
                  View created job in Marketplace
                  <ArrowRight size={18} />
                </a>
              </div>
            )}
          </div>

          {/* Educational sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 sticky top-4">
              <h3 className="text-lg font-bold text-white mb-4">What is L402?</h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex gap-3">
                  <span className="text-amber-400 flex-shrink-0">·</span>
                  <span>L402 = HTTP 402 + Lightning Network. Pay-per-call APIs without accounts.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-amber-400 flex-shrink-0">·</span>
                  <span>Server returns 402 + invoice on the first call.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-amber-400 flex-shrink-0">·</span>
                  <span>Client pays, retries with proof, gets the response.</span>
                </li>
              </ul>
              <a
                href="#"
                className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-semibold mt-6 transition-colors"
              >
                Read the spec <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
