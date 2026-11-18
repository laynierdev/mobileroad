import { RoadmapDashboard } from "@/components/RoadmapDashboard";
import { APP_DESCRIPTION, APP_NAME, SITE_URL } from "@/config";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: APP_NAME,
      url: SITE_URL,
      description: APP_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: APP_NAME,
      url: SITE_URL,
      description: APP_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Roadmap dashboard with a visual timeline",
        "Requirements analysis from PDF, DOCX, TXT or Markdown",
        "AI advisor, project audit and scope change analysis",
        "Export and import backups",
      ],
      isPartOf: { "@id": `${SITE_URL}/#website` },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <RoadmapDashboard />
    </>
  );
}
