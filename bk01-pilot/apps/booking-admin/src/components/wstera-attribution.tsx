export function WsteraAttribution({ admin = false }: { admin?: boolean }) {
  if (process.env.NEXT_PUBLIC_ATTRIBUTION_ENABLED === 'false') return null;

  const href = process.env.NEXT_PUBLIC_ATTRIBUTION_URL || 'https://by.wstera.com';
  const text = process.env.NEXT_PUBLIC_ATTRIBUTION_TEXT || 'Powered by WSTERA';

  return (
    <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 px-4 py-3 text-center text-[11px] text-slate-500">
      {admin ? 'KMO Booking Admin · ' : ''}
      <a href={href} target="_blank" rel="noreferrer" className="hover:text-slate-300">
        {text}
      </a>
    </footer>
  );
}
