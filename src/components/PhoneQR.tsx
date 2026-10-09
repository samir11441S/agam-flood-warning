"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export default function PhoneQR({ username, areaId, areaBn }: { username: string; areaId: string; areaBn: string }) {
  const link = `https://t.me/${username}?start=${areaId}`;
  const [svg, setSvg] = useState<{ link: string; markup: string } | null>(null);
  useEffect(() => {
    QRCode.toString(link, { type: "svg", margin: 1, width: 132 }).then((markup) => setSvg({ link, markup }));
  }, [link]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
      <div className="h-[132px] w-[132px] shrink-0 bg-white" dangerouslySetInnerHTML={{ __html: svg?.link === link ? svg.markup : "" }} />
      <div className="text-sm">
        <div className="font-semibold text-sky-900">Get this area&apos;s alerts on your phone</div>
        <p className="mt-1 text-sky-900/80">Scan with your phone camera → opens Telegram → you&apos;re subscribed to <span lang="bn">{areaBn}</span>. When an alert is approved, you&apos;ll get it and can answer <span lang="bn">&ldquo;আমি নিরাপদ&rdquo;</span> or <span lang="bn">&ldquo;সাহায্য দরকার&rdquo;</span>.</p>
        <a href={link} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 underline">{link}</a>
      </div>
    </div>
  );
}
