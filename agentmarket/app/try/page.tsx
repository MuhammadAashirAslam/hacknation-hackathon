'use client'

import { useState } from 'react'
import { Zap, Copy, CheckCircle, ArrowRight } from 'lucide-react'
import NewspaperLink from '@/components/NewspaperLink'

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

interface DemoTraceResponse {
  ok: boolean
  error?: string
  steps?: Array<{ title: string; response: string }>
  created_job_id?: string | null
}

export default function TryPage() {
  const [status, setStatus] = useState<DemoStatus>('idle')
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false])
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [stepResponses, setStepResponses] = useState<string[]>(STEPS.map((step) => step.response))

  const runDemo = async () => {
    setStatus('running-step-1')
    setCompletedSteps([false, false, false])
    setCreatedJobId(null)
    setStepResponses(STEPS.map((step) => step.response))

    let trace: DemoTraceResponse
    try {
      const res = await fetch('/api/demo/run-l402', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      trace = (await res.json()) as DemoTraceResponse
      if (!res.ok || !trace.steps || trace.steps.length < 3) {
        throw new Error(trace.error ?? `Demo failed with ${res.status}`)
      }
    } catch (err) {
      setStepResponses((prev) => {
        const next = [...prev]
        next[0] = `Request failed: ${(err as Error).message}`
        next[1] = 'Payment step did not run.'
        next[2] = 'Replay step did not run.'
        return next
      })
      setStatus('complete')
      return
    }

    setStepResponses((prev) => {
      const next = [...prev]
      next[0] = trace.steps![0].response
      return next
    })
    await new Promise(resolve => setTimeout(resolve, 350))
    setCompletedSteps(prev => [true, prev[1], prev[2]])

    setStatus('running-step-2')
    setStepResponses((prev) => {
      const next = [...prev]
      next[1] = trace.steps![1].response
      return next
    })
    await new Promise(resolve => setTimeout(resolve, 550))
    setCompletedSteps(prev => [prev[0], true, prev[2]])

    setStatus('running-step-3')
    setStepResponses((prev) => {
      const next = [...prev]
      next[2] = trace.steps![2].response
      return next
    })
    await new Promise(resolve => setTimeout(resolve, 350))
    setCompletedSteps([true, true, true])
    setCreatedJobId(trace.created_job_id ?? null)
    setStatus('complete')
  }

  const resetDemo = () => {
    setStatus('idle')
    setCompletedSteps([false, false, false])
    setCreatedJobId(null)
    setCopiedIndex(null)
    setStepResponses(STEPS.map((step) => step.response))
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
    if (stepStatus === 'complete') return 'border-[#6e8e6a] bg-[#e8efdf]/70'
    if (stepStatus === 'running') return 'border-[#2a1c12] bg-[#fffbf3]/85'
    return 'border-[#b39a78]/50 bg-[#fffbf3]/60'
  }

  const getStatusPillColor = (): string => {
    if (status === 'complete') return 'bg-[#e8efdf]/80 text-[#3d5a36] border-[#6e8e6a]/60'
    if (status !== 'idle') return 'bg-[#fffbf3]/85 text-[#2a1c12] border-[#2a1c12]/40'
    return 'bg-[#fffbf3]/60 text-[#6e5e54] border-[#b39a78]/50'
  }

  return (
    <main className="min-h-screen text-[#2a1c12] py-12 px-4">
      <div className="max-w-4xl mx-auto relative z-10">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h1 className="market-heading text-4xl sm:text-5xl font-bold text-[#2a1c12]">Try the L402 API</h1>
            <div className="px-3 py-1 bg-[#f5d68d]/40 border border-[#b39a78]/60 rounded-full text-sm font-mono text-[#2a1c12]">
              DEMO MODE
            </div>
          </div>
          <p className="text-[#6e5e54] text-lg">
            Watch a real Lightning payment unlock a real API call. Three steps, zero wallets needed.
          </p>
        </div>

        <div className="market-surface rounded-lg p-6 mb-8 font-mono text-sm text-[#3b2818]">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div>Settlement target: {'<'} 2 seconds</div>
            <div>Cost per call: 11 sats (10 reward + 1 fee)</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mb-8">
          <button
            onClick={runDemo}
            disabled={status !== 'idle' && status !== 'complete'}
            className="flex items-center gap-2 px-6 py-3 bg-[#2a1c12] hover:bg-[#1a0e06] disabled:bg-[#2a1c12]/40 disabled:cursor-not-allowed text-[#fffbf3] font-semibold rounded-lg transition-colors"
          >
            <Zap size={20} />
            Run the Demo
          </button>

          <button
            onClick={resetDemo}
            className="px-6 py-3 bg-transparent border border-[#2a1c12] text-[#2a1c12] hover:bg-[#2a1c12]/10 font-semibold rounded-lg transition-colors"
          >
            Reset
          </button>

          <div
            className={`px-4 py-3 rounded-lg border font-mono text-sm font-semibold flex items-center gap-2 ml-auto transition-colors ${getStatusPillColor()}`}
          >
            {status === 'idle' && <span className="w-2 h-2 bg-[#6e5e54] rounded-full"></span>}
            {status !== 'idle' && status !== 'complete' && <span className="w-2 h-2 bg-[#2a1c12] rounded-full animate-pulse"></span>}
            {status === 'complete' && <CheckCircle size={16} className="text-[#3d5a36]" />}
            {status === 'idle' && 'Idle'}
            {status === 'running-step-1' && 'Running Step 1'}
            {status === 'running-step-2' && 'Running Step 2'}
            {status === 'running-step-3' && 'Running Step 3'}
            {status === 'complete' && 'Complete'}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 space-y-4 relative">
            {status === 'idle' && (
              <div className="absolute inset-0 bg-[#f1e3cb]/40 rounded-lg flex items-center justify-center z-20 pointer-events-none">
                <p className="text-[#6e5e54] font-medium">Click Run to begin</p>
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
                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#2a1c12] text-[#fffbf3] flex items-center justify-center font-bold">
                      {stepIndex + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-[#2a1c12]">{step.title}</h3>
                      <p className="text-sm text-[#6e5e54]">{step.description}</p>
                    </div>
                    {stepStatus === 'complete' && <CheckCircle size={24} className="text-[#3d5a36] flex-shrink-0" />}
                  </div>

                  <div className="bg-[#fffbf3]/70 border border-[#b39a78]/60 rounded-lg overflow-hidden mb-4">
                    {step.curl && (
                      <div className="p-4 border-b border-[#b39a78]/40">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-[#8c7a6c] tracking-wider">REQUEST</span>
                          <button
                            onClick={() => copyToClipboard(step.curl!, stepIndex)}
                            className="p-1.5 hover:bg-[#2a1c12]/10 rounded text-[#6e5e54] hover:text-[#2a1c12] transition-colors"
                            title="Copy curl command"
                          >
                            {copiedIndex === stepIndex ? (
                              <CheckCircle size={16} className="text-[#3d5a36]" />
                            ) : (
                              <Copy size={16} />
                            )}
                          </button>
                        </div>
                        <code className="text-sm font-mono text-[#2a1c12] block whitespace-pre-wrap break-words">
                          {step.curl}
                        </code>
                      </div>
                    )}

                    <div className="p-4">
                      <span className="text-xs font-mono text-[#8c7a6c] tracking-wider">
                        {stepIndex === 0 ? 'RESPONSE (402 Payment Required)' : stepIndex === 1 ? 'PAYMENT OUTPUT' : 'RESPONSE (201 Created)'}
                      </span>
                      <code className="text-sm font-mono text-[#2a1c12] block whitespace-pre-wrap break-words mt-2">
                        {stepResponses[stepIndex]}
                      </code>
                    </div>
                  </div>

                  <p className="text-sm text-[#6e5e54]">{step.helper}</p>
                </div>
              )
            })}

            {status === 'complete' && createdJobId && (
              <div className="bg-[#e8efdf]/70 border border-[#6e8e6a]/60 rounded-lg p-6 text-center">
                <CheckCircle size={32} className="text-[#3d5a36] mx-auto mb-3" />
                <p className="text-[#2a1c12] font-semibold mb-4">Job created successfully!</p>
                <NewspaperLink
                  href={`/marketplace?highlight=${createdJobId}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#2a1c12] hover:bg-[#1a0e06] text-[#fffbf3] font-semibold rounded-lg transition-colors"
                >
                  View created job in Marketplace
                  <ArrowRight size={18} />
                </NewspaperLink>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="market-surface rounded-xl p-6 sticky top-4">
              <h3 className="text-lg font-bold text-[#2a1c12] mb-4">What is L402?</h3>
              <ul className="space-y-3 text-sm text-[#6e5e54]">
                <li className="flex gap-3">
                  <span className="text-[#2a1c12] font-bold flex-shrink-0">·</span>
                  <span>L402 = HTTP 402 + Lightning Network. Pay-per-call APIs without accounts.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-[#2a1c12] font-bold flex-shrink-0">·</span>
                  <span>Server returns 402 + invoice on the first call.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-[#2a1c12] font-bold flex-shrink-0">·</span>
                  <span>Client pays, retries with proof, gets the response.</span>
                </li>
              </ul>
              <a
                href="https://docs.lightning.engineering/the-lightning-network/l402"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[#2a1c12] hover:text-[#1a0e06] text-sm font-semibold mt-6 underline decoration-[#b39a78]/60 underline-offset-4 transition-colors"
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
