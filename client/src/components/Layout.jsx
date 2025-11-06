import React from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '../lib/utils';
import { AppSidebar } from './app-sidebar';
import { SidebarProvider, SidebarTrigger } from './ui/sidebar';

export function Layout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background text-foreground flex">
        <AppSidebar />
        <div className="flex-1">
          <header className="border-b border-border bg-card">
            <div className="px-4 py-3 flex items-center gap-3">
              <SidebarTrigger className="mr-1" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-sm">CA</span>
                </div>
                <h1 className="text-lg font-bold text-foreground">Crypto Arbitrage AI</h1>
              </div>
            </div>
          </header>
          <main className="px-4 py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}