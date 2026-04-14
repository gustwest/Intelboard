import LiveScoreInterface from '@/components/live-score/LiveScoreInterface';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BeachCoach Live Score',
  description: 'Real-time gesture-based scoring for Beach Volleyball',
  themeColor: '#020617', // tailwind slate-950
};

export default function LiveScorePage() {
  return <LiveScoreInterface />;
}
