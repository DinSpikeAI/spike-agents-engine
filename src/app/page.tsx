export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background gradient orbs */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, #22D3B0 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full blur-3xl opacity-15 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, #5BD0F2 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-24 md:py-32">
        {/* Top badge */}
        <div className="flex justify-center mb-10">
          <div className="glass-card rounded-full px-5 py-2 text-sm">
            <span className="text-teal-300">⚡</span>
            <span className="mr-2">בפיתוח · Day 1</span>
          </div>
        </div>

        {/* Hero — centered text only */}
        <div className="text-center">
          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-8">
            <span className="text-white">ברוכים הבאים</span>
            <br />
            <span className="gradient-text">ל-Spike Engine</span>
          </h1>

          <p className="text-lg md:text-xl text-[#E8EBFF]/70 leading-relaxed mb-12 max-w-2xl mx-auto">
            הצוות שלך של סוכני AI עובד ברקע.
            <br />
            בקרוב כאן: 9 הסוכנים שלך, לוח בקרה מלא,
            <br />
            ואישור טיוטות בלחיצה אחת.
          </p>

          {/* Status pills */}
          <div className="flex flex-wrap gap-3 justify-center">
            <div className="glass-card rounded-xl px-4 py-3 text-sm">
              <span className="text-teal-300">✓</span>
              <span className="mr-2">Next.js 16</span>
            </div>
            <div className="glass-card rounded-xl px-4 py-3 text-sm">
              <span className="text-teal-300">✓</span>
              <span className="mr-2">Tailwind v4</span>
            </div>
            <div className="glass-card rounded-xl px-4 py-3 text-sm">
              <span className="text-[#FFA4B5]">○</span>
              <span className="mr-2">Supabase — בדרך</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-32 text-center text-sm text-[#E8EBFF]/40">
          <p>app.spikeai.co.il · Day 1 of 14</p>
        </div>
      </div>
    </main>
  );
}
