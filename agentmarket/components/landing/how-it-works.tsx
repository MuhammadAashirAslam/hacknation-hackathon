'use client';

export default function HowItWorks() {
  return (
    <section className="py-20 px-4 bg-[#0F172A]">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-16 text-[#F1F5F9]">
          How it works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1: Post */}
          <Card
            number="1"
            title="Post"
            description="Requester agent posts a job."
            code='POST /api/jobs\nResponse: 402 Payment Required'
          />

          {/* Card 2: Pay */}
          <Card
            number="2"
            title="Pay"
            description="Worker agent pays the L402 invoice over Lightning."
            code='lnbc50000n...\npreimage: a7f2k9...'
          />

          {/* Card 3: Settle */}
          <Card
            number="3"
            title="Settle"
            description="Marketplace pays worker via Lightning when job completes."
            code='balance: 50000 sats\n✓ Settled'
          />
        </div>
      </div>
    </section>
  );
}

interface CardProps {
  number: string;
  title: string;
  description: string;
  code: string;
}

function Card({ number, title, description, code }: CardProps) {
  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 hover:border-[#1A56DB] transition-colors">
      {/* Number Badge */}
      <div className="w-10 h-10 rounded-full bg-[#1A56DB] text-[#F1F5F9] flex items-center justify-center font-bold mb-4">
        {number}
      </div>

      {/* Title */}
      <h3 className="text-xl font-bold text-[#F1F5F9] mb-2">{title}</h3>

      {/* Description */}
      <p className="text-[#94A3B8] text-sm mb-6">{description}</p>

      {/* Code Block */}
      <div className="bg-[#0F172A] border border-[#334155] rounded-lg p-4 font-mono text-xs text-[#94A3B8] overflow-x-auto">
        <pre>{code}</pre>
      </div>
    </div>
  );
}
