"use client";

import Image from "next/image";
import Link from "next/link";

export default function HeaderBrand() {
  return (
    <Link
      href="https://www.ideas2invest.com/"
      className="hidden min-w-0 items-center gap-2 rounded-2xl px-0 py-1 transition hover:bg-white/70 md:inline-flex"
      aria-label="Ideas2Invest home"
    >
      <span className="relative h-10 w-[180px] shrink-0 sm:h-14 sm:w-[205px]">
        <Image
          src="/images/logo/logo.png"
          alt="Ideas2Invest"
          fill
          priority
          className="object-contain"
        />
      </span>
      <span className="block max-w-[120px] text-center text-[12px] font-semibold leading-4 tracking-wide text-slate-500 sm:max-w-[150px]">
        AMFI-registered Mutual Funds Distributor
      </span>
    </Link>
  );
}
