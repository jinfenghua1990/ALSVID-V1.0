import { redirect } from 'next/navigation';

// This historic URL had only sample design content, not a persisted detail record.
// Return users to the live module; never render fictitious business data.
export default function RetiredDemoDetail() {
  redirect('/admin/dealers');
}
