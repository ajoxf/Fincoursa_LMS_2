import { DashShell } from "@/components/dash/DashShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashShell>{children}</DashShell>;
}
