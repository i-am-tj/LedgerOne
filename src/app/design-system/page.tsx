import type { Metadata } from "next";
import { ComponentGallery } from "@/components/design-system/component-gallery";
export const metadata: Metadata = { title: "Component library" };
export default function DesignSystemPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE SMALL DETAILS</p>
          <h1>Simple. Consistent. Considered.</h1>
          <p className="page-description">
            Explore the controls and feedback that shape LedgerOne.
          </p>
        </div>
      </div>
      <ComponentGallery />
    </>
  );
}
