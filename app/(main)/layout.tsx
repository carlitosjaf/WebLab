import { SidebarLayout } from "@/components/layout/sidebar-layout";
import React from "react";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <SidebarLayout>{children}</SidebarLayout>;
}
