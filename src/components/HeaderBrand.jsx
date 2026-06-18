"use client";

import Image from "next/image";
import Link from "next/link";

export default function HeaderBrand() {
  return (
    <Link
      href="https://www.ideas2invest.com/"
      className="inline-flex min-w-0 items-center gap-3 rounded-2xl px-0 py-1 transition hover:bg-white/70"
      aria-label="Ideas2Invest home"
    >
      <span className="relative h-12 w-[182px] sm:h-14 sm:w-[210px]">
        <Image
          src="/images/logo/logo.png"
          alt="Ideas2Invest"
          fill
          priority
          className="object-contain"
        />
      </span>
    </Link>
  );
}
