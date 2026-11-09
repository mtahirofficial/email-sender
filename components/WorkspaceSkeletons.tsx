import type { ReactNode } from "react";

function Bar({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-line/75 ${className}`} />;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section aria-hidden="true" className={`card p-5 sm:p-6 ${className}`}>{children}</section>;
}

function Page({ titleWidth = "w-48", width = "max-w-5xl", children }: { titleWidth?: string; width?: string; children: ReactNode }) {
  return (
    <main id="main" role="status" aria-label="Loading page content" className={`mx-auto w-full ${width} flex-1 px-4 py-8 sm:px-6 sm:py-10`}>
      <Bar className={`h-8 ${titleWidth}`} />
      <div className="mt-3">{children}</div>
    </main>
  );
}

export function DashboardSkeleton() {
  return <Page titleWidth="w-72" width="max-w-7xl"><Bar className="mt-2 h-4 w-80 max-w-full" />
    <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Card key={i}><Bar className="h-4 w-28" /><Bar className="mt-5 h-9 w-20" /><Bar className="mt-2 h-3 w-16" /></Card>)}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><Card className="min-h-72"><Bar className="h-5 w-44" /><Bar className="mt-6 h-44 w-full" /></Card><Card className="min-h-72"><Bar className="h-5 w-32" />{Array.from({ length: 3 }, (_, i) => <Bar key={i} className="mt-4 h-12 w-full" />)}</Card><Card className="xl:col-span-2"><Bar className="h-5 w-52" />{Array.from({ length: 4 }, (_, i) => <Bar key={i} className="mt-4 h-12 w-full" />)}</Card></div>
  </Page>;
}

export function AutomationSkeleton() {
  return <Page width="max-w-4xl"><Bar className="mt-2 h-4 w-[30rem] max-w-full" />
    <Card className="mt-6 flex gap-4"><Bar className="h-10 flex-1" /><Bar className="h-10 w-40" /></Card>
    <Card className="mt-5"><Bar className="h-6 w-56" /><div className="mt-5 grid gap-4 sm:grid-cols-2"><Bar className="h-12" /><Bar className="h-12" /></div><Bar className="mt-5 h-28 w-full" /><Bar className="mt-4 h-10 w-32" /></Card>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Card><Bar className="h-6 w-40" /><Bar className="mt-5 h-20" /></Card><Card><Bar className="h-6 w-36" /><Bar className="mt-5 h-20" /></Card></div>
  </Page>;
}

export function ComposeSkeleton() {
  return <Page width="max-w-6xl"><Bar className="mt-2 h-4 w-80 max-w-full" /><div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><Card><Bar className="h-5 w-36" /><Bar className="mt-5 h-11 w-full" /><Bar className="mt-4 h-11 w-full" /><Bar className="mt-4 h-11 w-full" /><Bar className="mt-4 h-52 w-full" /><Bar className="mt-5 h-11 w-36" /></Card><Card><Bar className="h-5 w-40" /><Bar className="mt-5 h-8 w-3/4" /><Bar className="mt-5 h-56 w-full" /></Card></div></Page>;
}

export function InboxSkeleton() {
  return <Page><Bar className="mt-2 h-4 w-[38rem] max-w-full" /><Card className="mt-6"><div className="flex flex-wrap gap-3"><Bar className="h-10 w-44" /><Bar className="h-10 w-32" /><Bar className="h-10 flex-1" /></div><div className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <Bar key={i} className="h-20 w-full" />)}</div><Bar className="min-h-[26rem] w-full" /></div></Card></Page>;
}

export function SentSkeleton() {
  return <Page><div className="mt-2 flex flex-wrap gap-2"><Bar className="h-9 w-20" /><Bar className="h-9 w-20" /><Bar className="h-9 w-20" /></div><Card className="mt-5"><Bar className="h-11 w-full" /><div className="mt-5 space-y-3">{Array.from({ length: 7 }, (_, i) => <Bar key={i} className="h-[4.25rem] w-full" />)}</div></Card></Page>;
}

export function SettingsSkeleton() {
  return <Page width="max-w-3xl"><Bar className="mt-2 h-4 w-80 max-w-full" /><Card className="mt-6 flex items-center justify-between gap-4"><div className="space-y-2"><Bar className="h-5 w-44" /><Bar className="h-4 w-64 max-w-full" /></div><Bar className="h-10 w-40" /></Card><Card className="mt-5"><Bar className="h-6 w-44" /><div className="mt-5 grid gap-3 md:grid-cols-2"><Bar className="h-32" /><Bar className="h-32" /></div></Card><Card className="mt-5"><Bar className="h-6 w-48" /><Bar className="mt-5 h-16 w-full" /><Bar className="mt-3 h-16 w-full" /></Card><div className="mt-5 grid gap-5"><Card><Bar className="h-5 w-40" /><Bar className="mt-4 h-11 w-full" /></Card><Card><Bar className="h-5 w-40" /><Bar className="mt-4 h-24 w-full" /></Card></div></Page>;
}

export function ProfileSkeleton() {
  return <Page width="max-w-3xl"><Card className="mt-5"><div className="flex items-center gap-4"><Bar className="h-16 w-16 rounded-full" /><div className="space-y-2"><Bar className="h-4 w-32" /><Bar className="h-3 w-48" /></div></div><div className="mt-7 space-y-4"><Bar className="h-11 w-full" /><Bar className="h-11 w-full" /><Bar className="h-11 w-36" /></div></Card></Page>;
}

export function VerifySkeleton() {
  return <Page width="max-w-4xl"><Bar className="mt-2 h-4 w-96 max-w-full" /><Card className="mt-6"><Bar className="h-5 w-44" /><Bar className="mt-4 h-28 w-full" /><Bar className="mt-4 h-11 w-36" /><Bar className="mt-6 h-36 w-full" /></Card></Page>;
}

export function AdminListSkeleton() {
  return <Page><div className="mt-2 flex items-center justify-between gap-4"><Bar className="h-4 w-64" /><Bar className="h-10 w-32" /></div><Card className="mt-6">{Array.from({ length: 6 }, (_, i) => <Bar key={i} className="mb-3 h-14 w-full last:mb-0" />)}</Card></Page>;
}

export function AdminFormSkeleton() {
  return <Page width="max-w-3xl"><Card className="mt-5"><Bar className="h-5 w-40" /><Bar className="mt-5 h-11 w-full" /><Bar className="mt-4 h-11 w-full" /><Bar className="mt-4 h-64 w-full" /><Bar className="mt-5 h-11 w-36" /></Card></Page>;
}

export function GenericWorkspaceSkeleton() {
  return <Page><Card className="mt-6"><Bar className="h-6 w-48" /><Bar className="mt-5 h-11 w-full" /><Bar className="mt-3 h-24 w-full" /><Bar className="mt-3 h-24 w-full" /></Card></Page>;
}
