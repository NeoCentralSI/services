const CLEANUP_ENV = "NABIL_INTEGRATION_TEST_CLEANUP";

export function shouldCleanupIntegrationData() {
  const value = process.env[CLEANUP_ENV] ?? "true";
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function runCleanupIfEnabled(label, cleanup) {
  if (!shouldCleanupIntegrationData()) {
    console.log(`[${label} cleanup] Skipped because ${CLEANUP_ENV}=false.`);
    return;
  }

  await cleanup();
}
