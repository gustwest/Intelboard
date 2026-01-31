"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowRight, LayoutDashboard, PlusCircle, Users, Zap, ShieldCheck, BarChart3, Building2, Check } from "lucide-react";
import { motion } from "framer-motion";
import { LoginDialog } from "@/components/login-dialog";

export default function Home() {
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
              The Future of Agile Staffing
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8"
          >
            Connect with top-tier consultants for high-impact microgigs. Get the critical intel and strategic insight you need to make your next best move with confidence.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="space-x-4 pt-4"
          >
            <LoginDialog />
            <Button size="lg" variant="outline" asChild>
              <Link href="/board">View Demo Board</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container space-y-6 bg-slate-900/50 py-12 lg:py-24 rounded-3xl">
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-5xl font-bold">
            Why IntelBoard?
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Streamline your decision-making with targeted expertise.
          </p>
        </div>
        <div className="mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-[64rem] md:grid-cols-3">
          <FeatureCard
            icon={<Zap className="h-10 w-10 mb-2 text-yellow-500" />}
            title="Strategic Microgigs"
            description="Engage experts for short, high-value tasks to unlock specific insights and direction."
          />
          <FeatureCard
            icon={<LayoutDashboard className="h-10 w-10 mb-2 text-blue-500" />}
            title="Actionable Intel"
            description="Don't guess. Get the precise knowledge you need to determine your next best step."
          />
          <FeatureCard
            icon={<ShieldCheck className="h-10 w-10 mb-2 text-green-500" />}
            title="Verified Experts"
            description="Access a curated network of top-tier consultants and entrepreneurs."
          />
          <FeatureCard
            icon={<PlusCircle className="h-10 w-10 mb-2 text-purple-500" />}
            title="Agile Native"
            description="Built around User Stories and Acceptance Criteria for seamless integration."
          />
          <FeatureCard
            icon={<Users className="h-10 w-10 mb-2 text-pink-500" />}
            title="Role-Based Views"
            description="Tailored experiences for Customers, Specialists, and Admins."
          />
          <FeatureCard
            icon={<BarChart3 className="h-10 w-10 mb-2 text-orange-500" />}
            title="Transparent Process"
            description="Clear negotiation of acceptance criteria before work begins."
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
            title="Post Request"
            description="Describe your need as an Agile User Story."
          />
          <StepCard
            number="2"
            title="Get Matched"
            description="Our AI finds the best specialist for the job."
          />
          <StepCard
            number="3"
            title="Start Work"
            description="Agree on criteria and track progress on the board."
          />
        </div>
      </section>
      {/* Sign Up Section */}
      <section className="container py-12 lg:py-24">
        <div className="mx-auto flex max-w-[58rem] flex-col items-center space-y-4 text-center mb-12">
          <h2 className="font-heading text-3xl leading-[1.1] sm:text-3xl md:text-5xl font-bold">
            Join the Ecosystem
          </h2>
          <p className="max-w-[85%] leading-normal text-muted-foreground sm:text-lg sm:leading-7">
            Whether you need intel or provide it, we have a path for you.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 max-w-[64rem] mx-auto">
          {/* Customer Card */}
          <Card className="flex flex-col h-full border-primary/20 dark:border-primary/20 bg-primary/5 dark:bg-primary/10">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mb-4">
                <Building2 className="h-6 w-6 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl">For Corporate Leaders</CardTitle>
              <CardDescription className="text-base">
                Get the insights you need, faster and cheaper.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Unmatched Quality:</strong> Access top 1% talent verified by AI and human experts.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Speed to Market:</strong> Skip the RFP process. Get matched in seconds, start in days.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span><strong>Economic Benefits:</strong> Pay for specific outcomes and microgigs, not idle bench time.</span>
                </li>
              </ul>
            </CardContent>
            <div className="p-6 pt-0 mt-auto">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Sign Up as Customer</Button>
            </div>
          </Card>

          {/* Agency Card */}
          <Card className="flex flex-col h-full border-accent/20 dark:border-accent/20 bg-accent/5 dark:bg-accent/10">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-accent-foreground" />
              </div>
              <CardTitle className="text-2xl">For Agencies & Consultants</CardTitle>
              <CardDescription className="text-base">
                Maximize utilization and consultant satisfaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  <span><strong>High-Value Flow:</strong> Consistent stream of strategic microgigs that fit your expertise.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  <span><strong>Zero Sales Overhead:</strong> We bring the clients to you. Focus on delivery, not BD.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  <span><strong>Talent Retention:</strong> Keep your best consultants engaged with exciting, diverse challenges.</span>
                </li>
              </ul>
            </CardContent>
            <div className="p-6 pt-0 mt-auto">
              <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">Join as Partner Agency</Button>
            </div>
          </Card>
        </div>
      </section>

      <footer className="py-10 border-t border-slate-200 mt-20 text-center">
        <p className="text-slate-400 text-sm">© 2025 IntelBoard. All rights reserved. <span className="opacity-50">v1.1.0-deploy-fix</span></p>
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
