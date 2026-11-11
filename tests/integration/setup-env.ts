import "dotenv/config";
const testURL = process.env.TEST_DATABASE_URL;
if (!testURL || !new URL(testURL).pathname.endsWith("_test"))
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated *_test database before integration tests.",
  );
process.env.DATABASE_URL = testURL;
