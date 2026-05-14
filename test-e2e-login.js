import { loginOrRegisterWithMicrosoft } from './src/services/microsoft-auth.service.js';

async function testLogin() {
  try {
    console.log("🧪 Testing simulated Microsoft Login for known user...");
    const mockProfile = {
      id: "mock-oauth-123",
      mail: "nabil_2211522018@fti.unand.ac.id",
      userPrincipalName: "nabil_2211522018@fti.unand.ac.id",
      displayName: "Nabil Rizki Navisa"
    };
    
    const result = await loginOrRegisterWithMicrosoft(mockProfile, "mock-access-token", "mock-refresh", true);
    console.log("✅ Login successful! Result tokens and user:");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("❌ Login failed!");
    console.error(error);
    process.exit(1);
  }
}

testLogin();
