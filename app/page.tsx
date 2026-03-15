import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Background styling for premium look */}
      <div className="absolute inset-0 bg-neutral-950 z-0"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-amber-900/20 via-neutral-950 to-neutral-950 z-0"></div>

      <div className="relative z-10 text-center max-w-4xl mx-auto flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-amber-500 text-sm font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          Now accepting appointments
        </div>

        <h1 className="text-5xl md:text-8xl font-bold tracking-tighter mb-6 text-white leading-tight">
          John <br />
          <span className="gradient-text">CukurShip.</span>
        </h1>

        {/* Slogan - terpisah dan menonjol */}
        <p className="text-base md:text-lg text-amber-400/90 font-medium italic mb-3 max-w-xl mx-auto tracking-wide">
          ✦ &quot;Moro Lungguh Mulih Ngguanteng John&quot; ✦
        </p>

        {/* Deskripsi - terpisah di bawah slogan */}
        <p className="text-sm md:text-base text-neutral-500 mb-10 max-w-xl mx-auto font-light leading-relaxed">
          Pesan jadwal cukur Anda sekarang dan rasakan pengalaman potong rambut terbaik di kelasnya.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center items-center">
          <Link href="/book" className="px-8 py-4 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold rounded-full transition-all duration-300 hover:scale-105 shadow-[0_0_30px_rgba(245,158,11,0.2)] w-full sm:w-auto flex items-center justify-center gap-2">
            Book Appointment
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link href="/login" className="px-8 py-4 bg-transparent border border-neutral-800 hover:border-amber-500 hover:text-amber-500 text-white font-medium rounded-full transition-all duration-300 w-full sm:w-auto">
            Barber Login
          </Link>
        </div>
      </div>
    </main>
  );
}
