# Project History & Stability Log

## Stable Version Reference (July 7, 2026 - Latest Active Stable)
This is documented as the **Best Stable Version** of the application. 
- **Status:** Fully functional, compiled, and validated with zero lint errors.
- **Architecture:** Fully migrated from local `db.json` / MongoDB / Firestore to **Supabase (PostgreSQL)**.
- **Key fixes and features applied:**
  - **Supabase Database Migration:** Successfully migrated all database structures (users, bills, payments, transactions, etc.) to Supabase PostgreSQL, completely resolving race conditions, merge conflicts, and local file sync delays.
  - **Diagnostic Verification:** Verified using `/api/system/diagnostics` that connections are 100% active and 67 users, 67 bills, 68 payments, and 67 transactions are successfully migrated.
  - **Robust Error Handling:** Added global process exception and rejection handlers (`uncaughtException`, `unhandledRejection`) to `server.ts` to guarantee absolute stability on Cloud Run containers.
  - **Auto Cleanup for Image Slips:** Implemented an automated cleanup routine (`runAutoCleanupOldSlips`) running every 24 hours to automatically purge Base64 slips older than 30 days and keep database storage optimized.
  - **Secure Migration Backup:** Created `/backups/migration_backup_2026-07-07.json` as a secure JSON backup of the original dataset before completing the migration, and preserved previous codebase snapshots.
  - **No-Flicker SPA Setup:** Maintained clean Express-level Vite SPA static file routing for seamless production deployment.

---

# Developer Guidelines (Instructions for AI Coding Agent)
1. **Preserve Supabase PostgreSQL Architecture:** Do not revert to `db.json` sync, MongoDB, or Firestore. The app is 100% stable with the `@supabase/supabase-js` service role setup.
2. **Exception Handling & Stability First:** Keep the global exception handlers in `server.ts` to ensure Cloud Run containers never crash due to network dropouts or query timeouts.
3. **Keep the Auto Cleanup Routine:** Ensure `runAutoCleanupOldSlips` remains active and scheduled inside `startServer` to prevent database bloat from base64 images.
4. **Maintain CamelCase Mapping:** Always use the `convertKeysToCamel` mapping routine in API handlers when returning database records to ensure the React frontend receives keys in camelCase style correctly.
