"use client";

import { useEffect, useState } from "react";

export default function Clock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="clock">--:--</span>;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  const open = hour >= 9 && hour < 19;
  return (
    <span className="clock">
      <time>{time}</time>
      <span className={open ? "is-open" : ""}>{open ? "Desk open" : "Desk closed"}</span>
    </span>
  );
}
