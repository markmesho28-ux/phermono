import React from 'react';
import {
  MessageCircle,
  Phone,
  Instagram,
  Facebook,
  Bot,
  ArrowRight,
} from 'lucide-react';

interface AboutPageProps {
  onNavigateHome: () => void;
  onNavigateAssistant: () => void;
}

export default function AboutPage({ onNavigateHome, onNavigateAssistant }: AboutPageProps) {
  const phoneNumberDisplay = '01010072795';
  const whatsappUrl = 'https://wa.me/201010072795';
  const telUrl = 'tel:+201010072795';
  const instagramUrl = 'https://www.instagram.com/phermonostore3?stkn=ZmlsZ3NsZXh0cW52';
  const facebookUrl = 'https://www.facebook.com/share/14pshxhK3vA/?mibextid=wwXIfr';

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10 animate-fadeIn select-none space-y-8 sm:space-y-10">

      {/* 1. Hero Brand Showcase */}
      <section className="relative overflow-hidden rounded-[32px] border border-brand-gold/30 bg-gradient-to-br from-brand-black via-brand-charcoal to-brand-stone text-white p-6 sm:p-12 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-brand-gold/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-brand-gold/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-luxury border-2 border-brand-gold bg-white flex items-center justify-center p-1 mb-5">
            <img src="/logo.jpg" alt="PherMono PhM Logo" className="w-full h-full object-contain" />
          </div>

          <p className="text-xs sm:text-sm font-bold tracking-wide text-brand-gold mb-2">
            Trusted pharmaceutical care for your skin & hair
          </p>

          <h1 className="font-serif-luxury text-3xl sm:text-5xl md:text-6xl leading-tight text-white mb-4">
            Pher<span className="text-brand-gold">Mono</span>
          </h1>

          <p className="font-tagline text-base sm:text-lg text-brand-gold/90 font-medium tracking-wide mb-6">
            Ur favorite Mono choice
          </p>

          <p className="text-sm sm:text-base text-stone-300 leading-relaxed max-w-xl">
            PherMono is your premier destination for curated luxury perfumes, dermatologist-backed skincare, professional makeup artistry, and holistic body care. We believe that self-care is a personal ritual of empowerment and elegance.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <button
              type="button"
              onClick={onNavigateHome}
              className="px-6 py-3 rounded-full bg-brand-gold hover:bg-brand-gold-dark text-brand-black font-bold text-xs sm:text-sm tracking-wide shadow-luxury transition-all flex items-center gap-2 cursor-pointer touch-target"
            >
              <span>Explore Departments</span>
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={onNavigateAssistant}
              className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs sm:text-sm tracking-wide transition-all flex items-center gap-2 cursor-pointer touch-target backdrop-blur-sm"
            >
              <Bot size={16} className="text-brand-gold" />
              <span>Ask Beauty Concierge</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Join Our Circle (Social Media & Community) */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center max-w-xl mx-auto mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-gold-dark">
            Join Our Circle
          </p>
          <h2 className="mt-1 font-serif-luxury text-2xl sm:text-3xl text-brand-black">
            Connect With PherMono
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-2">
            Follow our exclusive launches, beauty masterclasses, and perfume drops across social media.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 p-4 rounded-2xl border border-stone-100 hover:border-brand-gold/60 bg-[#FAF8F5] hover:bg-white hover:shadow-md transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Instagram size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-brand-black group-hover:text-brand-gold-dark transition-colors">Instagram</div>
              <div className="text-[11px] text-stone-400 truncate">@phermonostore3</div>
            </div>
          </a>

          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 p-4 rounded-2xl border border-stone-100 hover:border-brand-gold/60 bg-[#FAF8F5] hover:bg-white hover:shadow-md transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Facebook size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-brand-black group-hover:text-brand-gold-dark transition-colors">Facebook</div>
              <div className="text-[11px] text-stone-400 truncate">PherMono Store</div>
            </div>
          </a>
        </div>
      </section>

      {/* 3. Direct Assistance / Customer Care */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center max-w-xl mx-auto mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-gold-dark">
            Direct Assistance
          </p>
          <h2 className="mt-1 font-serif-luxury text-2xl sm:text-3xl text-brand-black">
            Contact & Customer Care
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center text-center p-5 rounded-2xl bg-stone-50 hover:bg-white border border-stone-100 hover:border-brand-gold/60 transition-all shadow-xs group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <MessageCircle size={22} />
            </div>
            <span className="text-sm font-bold text-brand-black mb-1">WhatsApp Direct</span>
            <span className="text-xs text-emerald-600 font-semibold">{phoneNumberDisplay}</span>
          </a>

          <a
            href={telUrl}
            className="flex flex-col items-center text-center p-5 rounded-2xl bg-stone-50 hover:bg-white border border-stone-100 hover:border-brand-gold/60 transition-all shadow-xs group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-brand-black text-brand-gold flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Phone size={22} />
            </div>
            <span className="text-sm font-bold text-brand-black mb-1">Call Us</span>
            <span className="text-xs text-stone-600 font-semibold">{phoneNumberDisplay}</span>
          </a>
        </div>
      </section>

    </div>
  );
}
