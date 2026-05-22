"use client";

import { ReactNode } from "react";

export function VideoGrid({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  // Responsive auto-grid: 1 / 2 / 3-4 / 5+
  const cols =
    count <= 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : count <= 4
          ? "grid-cols-1 sm:grid-cols-2"
          : count <= 6
            ? "grid-cols-2 sm:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <div className={`grid ${cols} gap-3 sm:gap-4 h-full content-center auto-rows-fr`}>
      {children}
    </div>
  );
}
