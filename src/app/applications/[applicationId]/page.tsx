import { ApplicationDetailClient } from "@/components/applications/application-detail-client";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;

  return <ApplicationDetailClient applicationId={applicationId} />;
}
