import { getThesesList } from "../src/services/thesisGuidance/monitoring.service.js";

async function verify() {
    console.log("🔍 Verifying Deadline Field in Monitoring List...");
    const result = await getThesesList({ page: 1, pageSize: 5 });

    if (result.data && result.data.length > 0) {
        const sample = result.data[0];
        console.log(`📌 Sample Thesis ID: ${sample.id}`);
        console.log(`   - Title: ${sample.title.substring(0, 30)}...`);
        console.log(`   - Deadline Date: ${sample.deadlineDate || 'MISSING'}`);

        if (sample.deadlineDate) {
            console.log("✅ Deadline field is present and populated.");
        } else {
            console.log("⚠️ Deadline field is missing or null.");
        }
    } else {
        console.log("❌ No thesis data found.");
    }
}

verify().catch(console.error).finally(() => process.exit());
