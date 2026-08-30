/**
 * Shown on both health tools, in the flow of the tool rather than in the footer.
 * A disclaimer a parent has to go looking for has not been given.
 */
export function ToolDisclaimer({ source, revisedOn }: { source: string; revisedOn?: string }) {
  return (
    <p className="m-0 mt-5 border-t border-moss-tint pt-4 text-[13px] leading-[1.55] text-muted">
      <strong className="font-semibold text-midnight">Not medical advice.</strong> These figures are
      a guide — your paediatrician knows your baby. Source: {source}
      {revisedOn ? `, rev. ${revisedOn}` : ""}.
    </p>
  );
}
