import { redirect } from 'next/navigation';

export default function Home() {
  const slug = process.env.NEXT_PUBLIC_DEFAULT_SHOP_SLUG?.trim();
  if (!slug) {
    throw new Error('NEXT_PUBLIC_DEFAULT_SHOP_SLUG is not configured');
  }
  redirect(`/book/${encodeURIComponent(slug)}`);
}
