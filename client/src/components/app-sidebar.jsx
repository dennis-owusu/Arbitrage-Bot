import * as React from "react"
import { LayoutDashboardIcon, BarChartIcon } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  brand: {
    name: "Crypto Arbitrage AI",
    initials: "CA",
  },
  navMain: [
    {
      title: "Opportunities",
      url: "/",
      icon: LayoutDashboardIcon,
    },
    {
      title: "Trading",
      url: "/trading",
      icon: BarChartIcon,
    },
    {
      title: "AI Assistant",
      url: "/ai",
      icon: BarChartIcon,
    },
  ],
}

export function AppSidebar({
  ...props
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:!p-1.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {data.brand.initials}
                </div>
                <span className="text-base font-semibold">{data.brand.name}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
    </Sidebar>
  );
}
