"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowRight, MessageSquare, BookOpen, Newspaper, CalendarDays, Users, Search, Check } from "lucide-react";
import { motion } from "framer-motion";
import { LoginDialog } from "@/components/login-dialog";
import { useRole } from "@/components/role-provider";

export default function Home() {
  const { currentUser, isLoading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && currentUser) {
      router.replace("/dashboard");
    }
  }, [currentUser, isLoading, router]);

  // Show nothing while checking auth to avoid flash of landing page
  if (isLoading || currentUser) {
    return null;
  }

  return (
    <div className="flex flex-col gap-12 pb-16 max-w-5xl mx-auto px-4">
      {/* Hero Section */}
      <section className="space-y-6 md:min-h-[calc(100vh-200px)] flex flex-col items-center justify-center py-12 lg:py-0">
        <div className="container flex flex-col items-center gap-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-primary to-accent text-transparent bg-clip-text pb-2">
              The Professional Community for Strategic Intelligence
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8"
          >
            Join a community of professionals sharing knowledge, insights, and expertise. Explore topic-based forums, stay updated with industry news, and connect through events and open requests.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="space-x-4 pt-4"
          >
            <LoginDialog />
            <Button size="lg" variant="outline" asChild>
              <Link href="/signup">Join the Community</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container space-y-6 bg-slate-900/50 py-12 lg:py-24 rounded-3xl">
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-5xl font-bold">
            Everything Your Community Needs
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            A single platform for knowledge sharing, discussions, and professional collaboration.
          </p>
        </div>
        <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
          <FeatureCard
            icon={<MessageSquare className="h-10 w-10 mb-2 text-blue-500" />}
            title="Community Forums"
            description="Engage in topic-based discussions with fellow professionals. Share insights, ask questions, and learn together."
          />
          <FeatureCard
            icon={<BookOpen className="h-10 w-10 mb-2 text-indigo-500" />}
            title="Knowledge Categories"
            description="Explore structured knowledge spaces organized by topic. Follow categories that matter to you."
          />
          <FeatureCard
            icon={<Newspaper className="h-10 w-10 mb-2 text-emerald-500" />}
            title="News & Reports"
            description="Stay up-to-date with curated industry news, research reports, and trending topics in your field."
          />
          <FeatureCard
            icon={<CalendarDays className="h-10 w-10 mb-2 text-amber-500" />}
            title="Events & Meetups"
            description="Discover industry events, schedule meetings, and attend virtual hubs with community members."
          />
          <FeatureCard
            icon={<Search className="h-10 w-10 mb-2 text-violet-500" />}
            title="Open Requests"
            description="Post requests for insights or short-term expertise and connect with community members who can help."
          />
          <FeatureCard
            icon={<Users className="h-10 w-10 mb-2 text-pink-500" />}
            title="Expert Network"
            description="Browse a directory of professionals with verified skills. Find the right expert for any challenge."
          />
        </div>
      </section>

      {/* How it Works */}
      <section className="container py-12 lg:py-24">
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center mb-12">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-5xl font-bold">
            How It Works
          </h2>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          <StepCard
            number="1"
            title="Explore Categories"
            description="Browse topic spaces and follow the categories that match your interests and expertise."
          />
          <StepCard
            number="2"
            title="Join Discussions"
            description="Participate in forums, share your knowledge, and learn from industry peers."
          />
          <StepCard
            number="3"
            title="Connect & Collaborate"
            description="Attend events, respond to open requests, and build your professional network."
          />
        </div>
      </section>

      {/* Join Section */}
      <section className="container py-12 lg:py-24">
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center mb-12">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-5xl font-bold">
            Join the Community
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Whether you&apos;re seeking knowledge or sharing expertise, there&apos;s a place for you.
          </p>
        </div>

        <div className="max-w-[42rem] mx-auto">
          <Card className="flex flex-col h-full border-primary/20 dark:border-primary/20 bg-primary/5 dark:bg-primary/10">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl">For Professionals & Teams</CardTitle>
              <CardDescription className="text-base">
                Access a thriving community of industry experts.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Knowledge Sharing:</strong> Access structured topic spaces, forums, and expert discussions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Stay Informed:</strong> Follow categories, receive news updates, and attend industry events.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Collaborate:</strong> Post open requests, find experts, and build your professional network.</span>
                </li>
              </ul>
            </CardContent>
            <div className="p-6 pt-0 mt-auto">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" asChild>
                <Link href="/signup">Create Your Account</Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <footer className="py-10 border-t border-slate-200 mt-20 text-center">
        <p className="text-slate-400 text-sm">© 2025 IntelBoard. All rights reserved. <span className="opacity-50">v2.0.0-community</span></p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <motion.div whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 300 }}>
      <Card className="h-full border-none shadow-md bg-background/60 backdrop-blur">
        <CardHeader>
          <div className="mb-2">{icon}</div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </motion.div>
  );
}

function StepCard({ number, title, description }: { number: string, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center text-center p-6">
      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mb-4">
        {number}
      </div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
