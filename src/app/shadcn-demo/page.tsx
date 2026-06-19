"use client";

import * as React from "react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import CardDemo1 from "@/components/cards-demo-1";
import CardDemo2 from "@/components/cards-demo-2";
import CardDemo3 from "@/components/cards-demo-3";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { BackgroundGradient } from "@/components/ui/background-gradient";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const chartData = [
  { day: "Mon", pnl: 120 },
  { day: "Tue", pnl: 210 },
  { day: "Wed", pnl: 160 },
  { day: "Thu", pnl: 280 },
  { day: "Fri", pnl: 340 },
];

const chartConfig = {
  pnl: {
    label: "PnL",
    color: "#22d3ee",
  },
} satisfies ChartConfig;

export default function ShadcnDemoPage() {
  const [progressValue, setProgressValue] = React.useState(64);

  return (
    <main className="min-h-dvh bg-[#060608] px-5 py-10 text-white sm:px-8">
      <Toaster richColors position="top-right" />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/90">
            Component Playground
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            shadcn + aceternity demo
          </h1>
          <p className="text-sm text-white/60">
            Route: <code className="rounded bg-white/10 px-1.5 py-0.5">/shadcn-demo</code>
          </p>
        </header>

        <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">Select</p>
            <Select defaultValue="xauusd">
              <SelectTrigger className="w-full bg-zinc-950">
                <SelectValue placeholder="Choose pair" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xauusd">XAUUSD</SelectItem>
                <SelectItem value="eurusd">EURUSD</SelectItem>
                <SelectItem value="nas100">NAS100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Progress</p>
            <Progress value={progressValue}>
              <ProgressLabel>Execution readiness</ProgressLabel>
            </Progress>
            <p className="text-xs text-white/65">{progressValue}%</p>
            <button
              type="button"
              onClick={() => setProgressValue((v) => (v >= 100 ? 12 : v + 12))}
              className="inline-flex h-9 items-center rounded-md border border-white/15 px-3 text-sm hover:bg-white/10"
            >
              +12%
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Sonner + Alert dialog</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => toast.success("AXE toast online")}
                className="inline-flex h-9 items-center rounded-md border border-cyan-300/30 px-3 text-sm text-cyan-200 hover:bg-cyan-300/10"
              >
                Show toast
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-md border border-white/15 px-3 text-sm hover:bg-white/10"
                  >
                    Open dialog
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Run staged action?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This is the new alert-dialog component working in the page.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => toast("Confirmed")}>Continue</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="mb-3 text-sm font-medium">Chart</p>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <LineChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="pnl"
                type="monotone"
                stroke="var(--color-pnl)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="mb-3 text-sm font-medium">Card spotlight</p>
          <CardSpotlight className="rounded-2xl border-cyan-500/30 bg-zinc-950 p-6" color="#0e7490">
            <h3 className="text-lg font-semibold">Aceternity CardSpotlight</h3>
            <p className="mt-2 text-sm text-white/70">
              Hover hier om de spotlight + canvas reveal te zien.
            </p>
          </CardSpotlight>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <BackgroundGradient containerClassName="rounded-3xl" className="rounded-[22px] bg-[#0a0a0f] p-4">
            <p className="text-sm font-medium">Background gradient</p>
            <p className="mt-2 text-sm text-white/65">Aceternity gradient wrapper component.</p>
            <AspectRatio ratio={16 / 9} className="mt-3 overflow-hidden rounded-xl border border-white/10">
              <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,#123,transparent_60%),#080b12] text-xs text-white/55">
                Aspect ratio 16:9
              </div>
            </AspectRatio>
          </BackgroundGradient>
          <CardDemo1 />
          <CardDemo2 />
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="mb-4 text-sm font-medium">Cards demo 3</p>
          <CardDemo3 />
        </section>
      </div>
    </main>
  );
}
