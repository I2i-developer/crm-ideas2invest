"use client";

import Link from "next/link";
import { BadgeIndianRupee, FileCheck2, Plane, UserRound } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const TAX_STATUS_CARDS = [
  {
    slug: "individual",
    title: "Individual",
    description: "Single, Joint, and Anyone or Survivor holder-wise requirements.",
    icon: UserRound,
    tone: "from-blue-600 to-indigo-700",
  },
  {
    slug: "minor",
    title: "Minor",
    description: "Minor holder and guardian document requirements. Nominee is not applicable.",
    icon: BadgeIndianRupee,
    tone: "from-amber-500 to-orange-700",
  },
  {
    slug: "nri",
    title: "NRI",
    description: "Passport, foreign address, nominee, and NRE/NRO bank requirements.",
    icon: Plane,
    tone: "from-emerald-600 to-teal-800",
  },
];

export default function DocumentRequirementsIndexPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Onboarding readiness"
        title="Required Documents"
        description="Select a tax status to view the dedicated document requirement page used by CRM onboarding and client uploads."
        icon={FileCheck2}
      />

      <section className="grid gap-5 md:grid-cols-3">
        {TAX_STATUS_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.slug}
              href={`/admin/document-requirements/${card.slug}`}
              className="group overflow-hidden rounded-3xl border border-white/60 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className={`bg-gradient-to-br ${card.tone} p-5 text-white`}>
                <Icon size={30} />
                <h2 className="mt-5 text-2xl font-semibold">{card.title}</h2>
              </div>
              <div className="p-5">
                <p className="min-h-12 text-sm leading-6 text-gray-600">{card.description}</p>
                <span className="mt-5 inline-flex rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 group-hover:bg-blue-700 group-hover:text-white">
                  View requirements
                </span>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
