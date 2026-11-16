import { DashShell } from "@/components/dash/DashShell";
import { AdminAlerts } from "./AdminAlerts";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashShell><AdminAlerts />{children}</DashShell>;
}
