import { redirect } from 'next/navigation';

export default function LegacyLoginHeadless() {
  redirect('/auth/login');
}
