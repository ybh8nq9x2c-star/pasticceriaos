export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAF7F2] flex">
      {/* Brand panel — left half on desktop */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#1A2B4A] p-14 text-white">
        <div>
          <span className="font-playfair text-2xl font-black tracking-tight">
            Pasticceria<span className="text-[#F5C842]">OS</span>
          </span>
          <p className="text-[10px] text-[#F5C842] uppercase tracking-[2px] mt-1">
            Sistema Operativo
          </p>
          <p className="mt-5 text-white/60 text-sm leading-relaxed max-w-xs">
            Il sistema operativo per la gestione completa di pasticcerie e fornitori.
          </p>
        </div>

        <div className="space-y-6">
          {[
            { icon: "🧮", label: "Calcolo ingredienti automatico" },
            { icon: "📦", label: "Gestione magazzino in tempo reale" },
            { icon: "🤝", label: "Collegamento diretto con il fornitore" },
            { icon: "📊", label: "Analytics e previsioni AI" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-sm text-white/80">
              <span className="text-xl">{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <p className="text-white/30 text-xs">© {new Date().getFullYear()} PasticceriaOS</p>
      </div>

      {/* Form panel — right half (or full on mobile) */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
