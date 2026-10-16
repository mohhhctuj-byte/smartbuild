type ProjectApiProbeInput = {
  contract: {
    template: string;
    productSpec?: { dataModels: Array<{ name: string }> };
  };
};

export function projectApiProbePath(run: ProjectApiProbeInput) {
  if (run.contract.template === "contact-form") return "/api/contact";
  const entity = run.contract.productSpec?.dataModels[0]?.name;
  if (!entity) throw new Error("PROJECT_DATA_MODEL_REQUIRED");
  return `/api/data/${encodeURIComponent(entity)}`;
}
