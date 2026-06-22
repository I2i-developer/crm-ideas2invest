const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://crm.ideas2invest.com";

const title = "Ideas2Invest CRM";
const description =
  "Sign in to the Ideas2Invest CRM for client onboarding, documents, tasks, SIP tracking, insurance renewals, and team operations.";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: "/login",
  },
  openGraph: {
    title,
    description,
    url: "/login",
    siteName: "Ideas2Invest CRM",
    type: "website",
    images: [
      {
        url: "/images/logo/logo.png",
        width: 1200,
        height: 630,
        alt: "Ideas2Invest logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/images/logo/logo.png"],
  },
};

export default function LoginLayout({ children }) {
  return children;
}
