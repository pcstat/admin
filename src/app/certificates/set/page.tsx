import { Suspense } from "react";
import { SetEditor } from "@/components/certificates/SetEditor";

export default function CertificateSetPage() {
  return (
    <Suspense fallback={null}>
      <SetEditor />
    </Suspense>
  );
}
