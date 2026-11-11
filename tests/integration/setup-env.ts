import { testDatabaseURL } from "../support/database";
process.env.DATABASE_URL = testDatabaseURL();
process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
